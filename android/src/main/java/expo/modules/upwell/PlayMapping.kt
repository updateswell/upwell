package expo.modules.upwell

import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.install.InstallState
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

/** Maps Play Core constants to the string unions used in JS (see src/core/types.ts). */
internal object PlayMapping {
  fun availability(value: Int): String = when (value) {
    UpdateAvailability.UPDATE_AVAILABLE -> "available"
    UpdateAvailability.UPDATE_NOT_AVAILABLE -> "notAvailable"
    UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS -> "inProgress"
    else -> "unknown"
  }

  fun installStatus(value: Int): String = when (value) {
    InstallStatus.PENDING -> "pending"
    InstallStatus.DOWNLOADING -> "downloading"
    InstallStatus.DOWNLOADED -> "downloaded"
    InstallStatus.INSTALLING -> "installing"
    InstallStatus.INSTALLED -> "installed"
    InstallStatus.FAILED -> "failed"
    InstallStatus.CANCELED -> "canceled"
    else -> "unknown"
  }

  fun updateType(name: String): Int = when (name) {
    "immediate" -> AppUpdateType.IMMEDIATE
    else -> AppUpdateType.FLEXIBLE
  }

  fun info(info: AppUpdateInfo): Map<String, Any?> {
    val availability = info.updateAvailability()
    val hasUpdate = availability == UpdateAvailability.UPDATE_AVAILABLE ||
      availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
    return mapOf(
      "kind" to "play",
      "updateAvailability" to availability(availability),
      "availableVersionCode" to if (hasUpdate) info.availableVersionCode() else null,
      "updatePriority" to info.updatePriority(),
      "stalenessDays" to info.clientVersionStalenessDays(),
      "immediateAllowed" to info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE),
      "flexibleAllowed" to info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
      "installStatus" to installStatus(info.installStatus()),
      "bytesDownloaded" to info.bytesDownloaded().toDouble(),
      "totalBytesToDownload" to info.totalBytesToDownload().toDouble()
    )
  }

  fun state(state: InstallState): Map<String, Any?> = mapOf(
    "status" to installStatus(state.installStatus()),
    "bytesDownloaded" to state.bytesDownloaded().toDouble(),
    "totalBytesToDownload" to state.totalBytesToDownload().toDouble(),
    "errorCode" to state.installErrorCode()
  )
}
