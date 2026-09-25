import ExpoModulesCore
import DeviceCheck
import CryptoKit

// App Attest the way Firebase App Check expects it. The client data hash is
// taken over the raw bytes of the challenge (and, for an assertion, of the
// artifact followed by the challenge), which both arrive base64 encoded.
// expo-app-integrity hashes the text of the string instead, which Firebase
// rejects.
public class AppAttestModule: Module {
  private let service = DCAppAttestService.shared

  public func definition() -> ModuleDefinition {
    Name("AppAttest")

    Constant("isSupported") {
      return service.isSupported
    }

    AsyncFunction("generateKeyAsync") { () -> String in
      return try await service.generateKey()
    }

    AsyncFunction("attestKeyAsync") { (keyId: String, challenge: String) -> String in
      let hash = try Self.hash([challenge])
      return try await service.attestKey(keyId, clientDataHash: hash).base64EncodedString()
    }

    AsyncFunction("generateAssertionAsync") { (keyId: String, artifact: String, challenge: String) -> String in
      let hash = try Self.hash([artifact, challenge])
      return try await service.generateAssertion(keyId, clientDataHash: hash).base64EncodedString()
    }
  }

  private static func hash(_ parts: [String]) throws -> Data {
    var data = Data()
    for part in parts {
      guard let bytes = Data(base64Encoded: part) else { throw InvalidBase64Exception() }
      data.append(bytes)
    }
    return Data(SHA256.hash(data: data))
  }
}

internal final class InvalidBase64Exception: Exception {
  override var reason: String {
    "Expected base64 encoded data"
  }
}
