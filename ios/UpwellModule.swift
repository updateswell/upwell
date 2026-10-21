import ExpoModulesCore
import StoreKit
import UIKit

private let storagePrefix = "upwell."

public class UpwellModule: Module {
  private var storeSheetDelegate: StoreSheetDelegate?

  public func definition() -> ModuleDefinition {
    Name("Upwell")

    // Android-only event; declared so the JS event emitter has the same shape on both platforms.
    Events("onPlayInstallState")

    Function("getInstalledInfo") { () -> [String: Any] in
      let bundle = Bundle.main
      let os = ProcessInfo.processInfo.operatingSystemVersion
      var info: [String: Any] = [
        "appId": bundle.bundleIdentifier ?? "",
        "nativeVersion": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
        "buildNumber": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "",
        "installSource": InstallSource.detect(),
        "installationId": self.installationId(),
        "osVersion": "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)"
      ]
      if let region = Locale.current.region?.identifier {
        info["regionCode"] = region
      }
      return info
    }

    Function("storageGet") { (key: String) -> String? in
      UserDefaults.standard.string(forKey: storagePrefix + key)
    }

    Function("storageSet") { (key: String, value: String) in
      UserDefaults.standard.set(value, forKey: storagePrefix + key)
    }

    Function("storageRemove") { (key: String) in
      UserDefaults.standard.removeObject(forKey: storagePrefix + key)
    }

    // Presents the App Store page in-app. Resolves "dismissed" when the user closes it.
    AsyncFunction("presentAppStore") { (appStoreId: String, promise: Promise) in
      guard let itemId = Int(appStoreId) else {
        promise.reject("ERR_INVALID_APP_STORE_ID", "appStoreId must be numeric, got \(appStoreId)")
        return
      }
      guard let presenter = self.topViewController() else {
        promise.reject("ERR_NO_VIEW_CONTROLLER", "No view controller to present the App Store sheet from")
        return
      }
      if self.storeSheetDelegate != nil {
        promise.reject("ERR_SHEET_IN_PROGRESS", "The App Store sheet is already showing")
        return
      }

      let controller = SKStoreProductViewController()
      let delegate = StoreSheetDelegate { [weak self] in
        self?.storeSheetDelegate = nil
        promise.resolve("dismissed")
      }
      self.storeSheetDelegate = delegate
      controller.delegate = delegate

      // Present first and load in parallel, as Apple recommends, so the sheet appears instantly.
      presenter.present(controller, animated: true)
      controller.loadProduct(withParameters: [SKStoreProductParameterITunesItemIdentifier: NSNumber(value: itemId)]) { [weak self] loaded, error in
        if loaded { return }
        DispatchQueue.main.async {
          controller.dismiss(animated: true)
          self?.storeSheetDelegate = nil
          promise.reject("ERR_APP_STORE_LOAD", error?.localizedDescription ?? "Could not load the App Store page")
        }
      }
    }.runOnQueue(.main)
  }

  private func installationId() -> String {
    let key = storagePrefix + "installationId"
    if let id = UserDefaults.standard.string(forKey: key) {
      return id
    }
    let id = UUID().uuidString
    UserDefaults.standard.set(id, forKey: key)
    return id
  }

  /// The top-most presented view controller, so the sheet also shows above React Native modals.
  private func topViewController() -> UIViewController? {
    var top = appContext?.utilities?.currentViewController() ?? Self.keyWindowRoot()
    while let presented = top?.presentedViewController, !presented.isBeingDismissed {
      top = presented
    }
    return top
  }

  private static func keyWindowRoot() -> UIViewController? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }?
      .rootViewController
  }
}

private final class StoreSheetDelegate: NSObject, SKStoreProductViewControllerDelegate {
  private let onFinish: () -> Void

  init(onFinish: @escaping () -> Void) {
    self.onFinish = onFinish
  }

  func productViewControllerDidFinish(_ viewController: SKStoreProductViewController) {
    viewController.dismiss(animated: true) { [onFinish] in
      onFinish()
    }
  }
}

enum InstallSource {
  /// `appStore`, `testFlight`, `sideload` (development, ad hoc or enterprise signed) or `unknown` (simulator).
  static func detect() -> String {
    #if targetEnvironment(simulator)
    return "unknown"
    #else
    // App Store and TestFlight builds have their provisioning profile stripped.
    if Bundle.main.path(forResource: "embedded", ofType: "mobileprovision") != nil {
      return "sideload"
    }
    if Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt" {
      return "testFlight"
    }
    return "appStore"
    #endif
  }
}
