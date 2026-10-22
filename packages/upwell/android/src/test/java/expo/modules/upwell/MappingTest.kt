package expo.modules.upwell

import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import org.junit.Assert.assertEquals
import org.junit.Test

class MappingTest {
  @Test
  fun mapsAvailability() {
    assertEquals("available", PlayMapping.availability(UpdateAvailability.UPDATE_AVAILABLE))
    assertEquals("notAvailable", PlayMapping.availability(UpdateAvailability.UPDATE_NOT_AVAILABLE))
    assertEquals("inProgress", PlayMapping.availability(UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS))
    assertEquals("unknown", PlayMapping.availability(UpdateAvailability.UNKNOWN))
  }

  @Test
  fun mapsInstallStatus() {
    assertEquals("pending", PlayMapping.installStatus(InstallStatus.PENDING))
    assertEquals("downloading", PlayMapping.installStatus(InstallStatus.DOWNLOADING))
    assertEquals("downloaded", PlayMapping.installStatus(InstallStatus.DOWNLOADED))
    assertEquals("installing", PlayMapping.installStatus(InstallStatus.INSTALLING))
    assertEquals("installed", PlayMapping.installStatus(InstallStatus.INSTALLED))
    assertEquals("failed", PlayMapping.installStatus(InstallStatus.FAILED))
    assertEquals("canceled", PlayMapping.installStatus(InstallStatus.CANCELED))
    assertEquals("unknown", PlayMapping.installStatus(InstallStatus.UNKNOWN))
  }

  @Test
  fun mapsUpdateType() {
    assertEquals(AppUpdateType.IMMEDIATE, PlayMapping.updateType("immediate"))
    assertEquals(AppUpdateType.FLEXIBLE, PlayMapping.updateType("flexible"))
  }

  @Test
  fun classifiesInstallSource() {
    assertEquals("play", InstallSource.classify("com.android.vending", false))
    assertEquals("play", InstallSource.classify("com.google.android.feedback", true))
    assertEquals("unknown", InstallSource.classify(null, true))
    assertEquals("sideload", InstallSource.classify(null, false))
    assertEquals("sideload", InstallSource.classify("com.sec.android.app.samsungapps", false))
  }
}
