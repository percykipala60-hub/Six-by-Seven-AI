import UIKit
import Capacitor

private let themeNames: Set<String> = [
    "bleu", "rouge", "rose", "violet", "neon", "jaune", "vert", "ambre", "gris",
    "facebook", "sms", "whatsapp", "linkedin", "telegram", "instagram", "tiktok",
    "google", "claude", "kimi", "pinterest"
]

@objc(SixThemePlugin)
public class SixThemePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SixThemePlugin"
    public let jsName = "SixTheme"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setLauncherIcon", returnType: CAPPluginReturnPromise)
    ]

    @objc func setLauncherIcon(_ call: CAPPluginCall) {
        guard let accent = call.getString("accent"), themeNames.contains(accent) else {
            call.reject("Thème d'icône inconnu.")
            return
        }
        let iconName = accent == "bleu" ? nil : "AppIcon-\(accent)"
        UIApplication.shared.setAlternateIconName(iconName) { error in
            if let error {
                call.reject("Impossible de changer l'icône de Six : \(error.localizedDescription)")
            } else {
                call.resolve()
            }
        }
    }
}

private class SixBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SixThemePlugin())
        bridge?.registerPluginInstance(SixSharePlugin())
    }
}

@objc(SixSharePlugin)
public class SixSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SixSharePlugin"
    public let jsName = "SixShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "consumeSharedDraft", returnType: CAPPluginReturnPromise)
    ]

    @objc func consumeSharedDraft(_ call: CAPPluginCall) {
        let shared = UserDefaults(suiteName: "group.com.sevenai.six")
        let draft = shared?.string(forKey: "sharedDraft") ?? ""
        shared?.removeObject(forKey: "sharedDraft")
        call.resolve(["text": draft])
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = SixBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
