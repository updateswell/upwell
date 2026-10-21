import ExpoModulesCore

public class UpwellModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Upwell")

    Events("onChange")

    Constant("PI") {
      Double.pi
    }

    AsyncFunction("setValueAsync") { (value: String) in
      self.sendEvent("onChange", [
        "value": value
      ])
    }
  }
}
