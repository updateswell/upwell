package expo.modules.upwell

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.google.android.play.core.appupdate.testing.FakeAppUpdateManager
import com.google.android.play.core.install.model.AppUpdateType

/**
 * Drives Play's FakeAppUpdateManager so every in-app update state can be exercised without
 * Play internal app sharing. The rest of the module talks to it exactly like the real manager.
 */
internal class PlaySimulation(context: Context, config: Map<String, Any?>) {
  val manager = FakeAppUpdateManager(context)
  private val handler = Handler(Looper.getMainLooper())
  private val userAccepts = config["userAccepts"] as? Boolean ?: true
  private val failDownload = config["failDownload"] as? Boolean ?: false
  private val totalBytes = (config["totalBytes"] as? Number)?.toLong() ?: 25_000_000L
  private val stepMs = (config["stepMs"] as? Number)?.toLong() ?: 400L
  private val steps = 10

  init {
    val versionCode = (config["availableVersionCode"] as? Number)?.toInt()
    if (versionCode == null) {
      manager.setUpdateNotAvailable()
    } else {
      when (config["allowedUpdateType"] as? String) {
        "flexible" -> manager.setUpdateAvailable(versionCode, AppUpdateType.FLEXIBLE)
        "immediate" -> manager.setUpdateAvailable(versionCode, AppUpdateType.IMMEDIATE)
        else -> manager.setUpdateAvailable(versionCode)
      }
      (config["updatePriority"] as? Number)?.let { manager.setUpdatePriority(it.toInt()) }
      manager.setClientVersionStalenessDays((config["stalenessDays"] as? Number)?.toInt())
    }
  }

  /**
   * Called after `startUpdateFlowForResult` returned on the fake. Plays the user's answer and
   * then a download. Calls [onResult] with the same result codes a real activity would report.
   */
  fun runFlow(type: Int, onResult: (accepted: Boolean) -> Unit) {
    handler.postDelayed({
      if (!userAccepts) {
        manager.userRejectsUpdate()
        onResult(false)
        return@postDelayed
      }
      manager.userAcceptsUpdate()
      onResult(true)
      manager.downloadStarts()
      manager.setTotalBytesToDownload(totalBytes)
      step(1, type)
    }, stepMs)
  }

  private fun step(i: Int, type: Int) {
    handler.postDelayed({
      if (failDownload && i > steps / 2) {
        manager.downloadFails()
        return@postDelayed
      }
      manager.setBytesDownloaded(totalBytes * i / steps)
      if (i < steps) {
        step(i + 1, type)
      } else {
        manager.downloadCompletes()
        // An immediate update installs on its own; a flexible one waits for completeUpdate().
        if (type == AppUpdateType.IMMEDIATE) handler.postDelayed({ installCompletes() }, stepMs)
      }
    }, stepMs)
  }

  /** Mirrors what happens after `completeUpdate()`; a real app would restart here. */
  fun installCompletes() {
    handler.postDelayed({ manager.installCompletes() }, stepMs)
  }

  fun dispose() {
    handler.removeCallbacksAndMessages(null)
  }
}
