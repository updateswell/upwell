package expo.modules.upwell

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UpwellModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Upwell")

    Events("onChange")

    Constant("PI") {
      Math.PI
    }

    AsyncFunction("setValueAsync") { value: String ->
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }
  }
}
