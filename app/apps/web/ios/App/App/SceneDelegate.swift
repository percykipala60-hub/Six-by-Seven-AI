import AuthenticationServices
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
        bridge?.registerPluginInstance(SixAuthPlugin())
    }
}

/// Connexion avec Apple ou Google dans l'app iPhone. Dans la WebView, window.open envoie la page du
/// fournisseur dans Safari, qui revient ensuite sur le site et jamais dans l'app. Ici, la fenêtre de
/// connexion du système (ASWebAuthenticationSession) s'ouvre par-dessus Six et se referme d'elle-même
/// dès que Supabase renvoie vers six://auth : l'app web reçoit alors l'adresse de retour avec la session.
@objc(SixAuthPlugin)
public class SixAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "SixAuthPlugin"
    public let jsName = "SixAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ouvrir", returnType: CAPPluginReturnPromise)
    ]

    /// Gardée en vie le temps de la connexion (sinon la fenêtre se ferme aussitôt).
    private var session: ASWebAuthenticationSession?

    /// { url } : page de connexion du fournisseur (https). Renvoie { url } : l'adresse six://auth… de retour,
    /// ou une chaîne vide si la personne a fermé la fenêtre.
    @objc func ouvrir(_ call: CAPPluginCall) {
        guard let texte = call.getString("url"), let url = URL(string: texte), url.scheme == "https" else {
            call.reject("Adresse de connexion invalide.")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let connexion = ASWebAuthenticationSession(url: url, callbackURLScheme: "six") { [weak self] retour, erreur in
                self?.session = nil
                if let retour {
                    call.resolve(["url": retour.absoluteString])
                } else if let erreur = erreur as? ASWebAuthenticationSessionError, erreur.code == .canceledLogin {
                    call.resolve(["url": ""])
                } else {
                    call.reject(erreur?.localizedDescription ?? "Connexion interrompue.")
                }
            }
            connexion.presentationContextProvider = self
            self.session = connexion
            if !connexion.start() {
                self.session = nil
                call.reject("La fenêtre de connexion n'a pas pu s'ouvrir.")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

@objc(SixSharePlugin)
public class SixSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SixSharePlugin"
    public let jsName = "SixShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "consumeSharedDraft", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeSharedCapture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openShortcuts", returnType: CAPPluginReturnPromise)
    ]

    @objc func consumeSharedDraft(_ call: CAPPluginCall) {
        let shared = UserDefaults(suiteName: "group.com.sevenai.six")
        let draft = shared?.string(forKey: "sharedDraft") ?? ""
        shared?.removeObject(forKey: "sharedDraft")
        call.resolve(["text": draft])
    }

    /// Page demandée par un raccourci (Siri, bouton Action…) ou un lien six://, une seule fois.
    @objc func consumePendingRoute(_ call: CAPPluginCall) {
        call.resolve(["route": SixRaccourcis.consommerPage()])
    }

    /// Capture d'écran déposée par le raccourci « Analyser une capture avec Six », une seule fois.
    @objc func consumeSharedCapture(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            if let capture = SixRaccourcis.consommerCapture() {
                call.resolve(["data": capture.base64, "type": capture.type])
            } else {
                call.resolve(["data": "", "type": ""])
            }
        }
    }

    /// Écran natif « Siri et raccourcis » (Réglages de Six).
    @objc func openShortcuts(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            SixRaccourcisEcran.presenter(depuis: self?.bridge?.viewController)
            call.resolve()
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = SixBridgeViewController()
        window?.makeKeyAndVisible()

        // Ouverture à froid par un lien six://… : la page est reprise par l'app web au chargement.
        for contexte in connectionOptions.urlContexts { SixRaccourcis.gererLien(contexte.url) }
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for contexte in URLContexts { SixRaccourcis.gererLien(contexte.url) }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
