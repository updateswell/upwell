package expo.modules.upwell

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Build

internal object InstallSource {
  private val PLAY_INSTALLERS = setOf("com.android.vending", "com.google.android.feedback")

  /** `play`, `sideload` (another installer or none) or `unknown` (debuggable/dev builds). */
  fun classify(installer: String?, debuggable: Boolean): String = when {
    installer in PLAY_INSTALLERS -> "play"
    debuggable -> "unknown"
    else -> "sideload"
  }

  fun installerPackage(context: Context): String? = try {
    val pm = context.packageManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      pm.getInstallSourceInfo(context.packageName).installingPackageName
    } else {
      @Suppress("DEPRECATION")
      pm.getInstallerPackageName(context.packageName)
    }
  } catch (e: Exception) {
    null
  }

  fun detect(context: Context): String {
    val debuggable = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    return classify(installerPackage(context), debuggable)
  }
}
