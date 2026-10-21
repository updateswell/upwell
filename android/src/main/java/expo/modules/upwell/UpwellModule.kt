package expo.modules.upwell

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.ActivityResult
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale
import java.util.UUID

private const val PREFS = "upwell"
private const val REQUEST_CODE = 0x5577
private const val INSTALL_STATE_EVENT = "onPlayInstallState"

class UpwellModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val prefs: SharedPreferences
    get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private var realManager: AppUpdateManager? = null
  private var simulation: PlaySimulation? = null
  private var registeredOn: AppUpdateManager? = null
  private var pendingStart: Promise? = null
  private var pendingType: Int = AppUpdateType.FLEXIBLE
  private var immediateRequested = false

  private val installListener = InstallStateUpdatedListener { state ->
    sendEvent(INSTALL_STATE_EVENT, PlayMapping.state(state))
  }

  private fun manager(): AppUpdateManager {
    val m = simulation?.manager ?: realManager ?: AppUpdateManagerFactory.create(context).also { realManager = it }
    if (registeredOn !== m) {
      registeredOn?.unregisterListener(installListener)
      m.registerListener(installListener)
      registeredOn = m
    }
    return m
  }

  override fun definition() = ModuleDefinition {
    Name("Upwell")

    Events(INSTALL_STATE_EVENT)

    OnDestroy {
      registeredOn?.unregisterListener(installListener)
      registeredOn = null
      simulation?.dispose()
    }

    Function("getInstalledInfo") {
      val pm = context.packageManager
      val pkg = context.packageName
      val info = pm.getPackageInfo(pkg, 0)
      val build = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.longVersionCode
      } else {
        @Suppress("DEPRECATION")
        info.versionCode.toLong()
      }
      mapOf(
        "appId" to pkg,
        "nativeVersion" to (info.versionName ?: ""),
        "buildNumber" to build.toString(),
        "installSource" to if (simulation != null) "play" else InstallSource.detect(context),
        "installer" to InstallSource.installerPackage(context),
        "installationId" to installationId(),
        "osVersion" to Build.VERSION.RELEASE,
        "regionCode" to Locale.getDefault().country.ifEmpty { null }
      )
    }

    Function("storageGet") { key: String -> prefs.getString(key, null) }
    Function("storageSet") { key: String, value: String -> prefs.edit().putString(key, value).apply() }
    Function("storageRemove") { key: String -> prefs.edit().remove(key).apply() }

    Function("setPlaySimulation") { config: Map<String, Any?>? ->
      simulation?.dispose()
      simulation = config?.let { PlaySimulation(context, it) { state -> sendEvent(INSTALL_STATE_EVENT, state) } }
      // Re-register the listener on whichever manager is now active.
      manager()
      simulation != null
    }

    AsyncFunction("checkPlayUpdate") { promise: Promise ->
      manager().appUpdateInfo
        .addOnSuccessListener { info -> promise.resolve(PlayMapping.info(info)) }
        .addOnFailureListener { e -> promise.reject(PlayException("ERR_PLAY_CHECK", e)) }
    }

    AsyncFunction("startPlayUpdate") { typeName: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(CodedException("ERR_NO_ACTIVITY", "No current activity to start the update flow from", null))
        return@AsyncFunction
      }
      if (pendingStart != null) {
        promise.reject(CodedException("ERR_FLOW_IN_PROGRESS", "An update flow is already showing", null))
        return@AsyncFunction
      }
      val type = PlayMapping.updateType(typeName)
      manager().appUpdateInfo
        .addOnSuccessListener { info -> start(activity, info, type, promise) }
        .addOnFailureListener { e -> promise.reject(PlayException("ERR_PLAY_CHECK", e)) }
    }

    AsyncFunction("completePlayUpdate") { promise: Promise ->
      manager().completeUpdate()
        .addOnSuccessListener {
          simulation?.installCompletes()
          promise.resolve(null)
        }
        .addOnFailureListener { e -> promise.reject(PlayException("ERR_PLAY_COMPLETE", e)) }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE) return@OnActivityResult
      val promise = pendingStart ?: return@OnActivityResult
      pendingStart = null
      promise.resolve(resultName(payload.resultCode))
    }

    // An immediate update that the user left (home button) must be resumed, or the app keeps
    // running below the required version.
    OnActivityEntersForeground {
      if (!immediateRequested) return@OnActivityEntersForeground
      val activity = appContext.currentActivity ?: return@OnActivityEntersForeground
      manager().appUpdateInfo.addOnSuccessListener { info ->
        if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
          try {
            manager().startUpdateFlowForResult(info, activity, AppUpdateOptions.defaultOptions(AppUpdateType.IMMEDIATE), REQUEST_CODE)
          } catch (_: Exception) {
            // Nothing to resume; JS re-checks on foreground and shows the blocking screen.
          }
        }
      }
    }
  }

  private fun start(activity: Activity, info: AppUpdateInfo, type: Int, promise: Promise) {
    val options = AppUpdateOptions.defaultOptions(type)
    val resumable = info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
    // Same check checkPlayUpdate reports as immediateAllowed / flexibleAllowed.
    if (!resumable && !info.isUpdateTypeAllowed(type)) {
      val name = if (type == AppUpdateType.IMMEDIATE) "an immediate" else "a flexible"
      promise.reject(CodedException("ERR_UPDATE_NOT_ALLOWED", "Play does not allow $name update right now", null))
      return
    }
    try {
      pendingStart = promise
      pendingType = type
      if (type == AppUpdateType.IMMEDIATE) immediateRequested = true
      val started = manager().startUpdateFlowForResult(info, activity, options, REQUEST_CODE)
      if (!started) {
        pendingStart = null
        promise.resolve("notStarted")
        return
      }
      simulation?.runFlow(type) { accepted ->
        val p = pendingStart ?: return@runFlow
        pendingStart = null
        p.resolve(if (accepted) "accepted" else "canceled")
      }
    } catch (e: Exception) {
      pendingStart = null
      promise.reject(PlayException("ERR_PLAY_START", e))
    }
  }

  private fun resultName(code: Int): String = when (code) {
    Activity.RESULT_OK -> "accepted"
    Activity.RESULT_CANCELED -> "canceled"
    ActivityResult.RESULT_IN_APP_UPDATE_FAILED -> "failed"
    else -> "failed"
  }

  private fun installationId(): String {
    prefs.getString("installationId", null)?.let { return it }
    val id = UUID.randomUUID().toString()
    prefs.edit().putString("installationId", id).apply()
    return id
  }
}

internal class PlayException(code: String, cause: Throwable) :
  CodedException(code, cause.message ?: "Play in-app update error", cause)
