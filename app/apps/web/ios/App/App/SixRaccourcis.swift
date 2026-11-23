import AppIntents
import Capacitor
import SwiftUI
import UIKit

// Raccourcis de Six sur iPhone : liens six://, App Intents (Siri, app Raccourcis, bouton Action, Centre de
// contrôle, écran verrouillé, AssistiveTouch) et l'écran « Siri et raccourcis » ouvert depuis les Réglages.
//
// Le natif ne parle jamais à l'IA : il dépose un texte (presse-papiers) et une page à ouvrir dans le groupe
// d'apps ; l'app web les reprend (SixShare.consumeSharedDraft et SixShare.consumePendingRoute) et c'est
// l'utilisateur qui lance l'analyse.

enum SixDestination: String, CaseIterable {
    case repondre
    case sevenAI = "seven-ai"
    case sujets
    case jeux

    /// Page de l'app web à ouvrir.
    var route: String {
        switch self {
        case .repondre: return "/"
        case .sevenAI: return "/seven-ai"
        case .sujets: return "/sujets"
        case .jeux: return "/espace-jeu"
        }
    }

    /// six://repondre, six://seven-ai, six://sujets, six://jeux
    init?(url: URL) {
        guard url.scheme?.lowercased() == "six" else { return nil }
        let nom = (url.host ?? url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))).lowercased()
        self.init(rawValue: nom)
    }
}

enum SixRaccourcis {
    static let groupe = "group.com.sevenai.six"
    private static let clePage = "pendingRoute"
    private static let cleTexte = "sharedDraft"

    /// Demande à l'app web d'ouvrir une page dès qu'elle est visible.
    static func ouvrir(_ destination: SixDestination) {
        UserDefaults(suiteName: groupe)?.set(destination.route, forKey: clePage)
    }

    /// Prépare un texte dans Six (relu par l'utilisateur avant toute analyse), 2000 caractères au plus.
    static func preparerTexte(_ texte: String) {
        let propre = texte.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !propre.isEmpty else { return }
        UserDefaults(suiteName: groupe)?.set(String(propre.prefix(2000)), forKey: cleTexte)
    }

    /// Capture d'écran reçue d'un raccourci (« Prendre une capture d'écran » puis « Analyser une capture
    /// avec Six »). Gardée dans le groupe d'apps jusqu'à ce que Six la lise sur le téléphone, puis effacée.
    private static var fichierCapture: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: groupe)?
            .appendingPathComponent("capture-partagee")
    }

    /// 15 Mo au plus : une capture d'écran d'iPhone fait quelques Mo.
    static let tailleMaxCapture = 15 * 1024 * 1024

    static func preparerCapture(_ donnees: Data) -> Bool {
        guard !donnees.isEmpty, donnees.count <= tailleMaxCapture, let url = fichierCapture else {
            return false
        }
        do {
            try donnees.write(to: url, options: [.atomic, .completeFileProtection])
            return true
        } catch {
            return false
        }
    }

    /// Renvoie la capture en attente (base64 et type) et l'efface : elle n'est lue qu'une fois.
    static func consommerCapture() -> (base64: String, type: String)? {
        guard let url = fichierCapture, let donnees = try? Data(contentsOf: url) else { return nil }
        try? FileManager.default.removeItem(at: url)
        let octets = [UInt8](donnees.prefix(4))
        let type: String
        if octets.starts(with: [0x89, 0x50, 0x4E, 0x47]) {
            type = "image/png"
        } else if octets.starts(with: [0xFF, 0xD8]) {
            type = "image/jpeg"
        } else {
            return nil // format inconnu (HEIC…) : non lu par Six, on n'insiste pas
        }
        return (donnees.base64EncodedString(), type)
    }

    static func consommerPage() -> String {
        let defaults = UserDefaults(suiteName: groupe)
        let page = defaults?.string(forKey: clePage) ?? ""
        defaults?.removeObject(forKey: clePage)
        return page
    }

    /// Lien six://… reçu (ouverture à froid ou app déjà lancée).
    @discardableResult
    static func gererLien(_ url: URL) -> Bool {
        guard let destination = SixDestination(url: url) else { return false }
        ouvrir(destination)
        return true
    }
}

// MARK: - App Intents (iOS 16 et plus)

@available(iOS 16.0, *)
struct RepondreAvecSixIntent: AppIntent {
    static var title: LocalizedStringResource = "Répondre avec Six"
    static var description = IntentDescription(
        "Ouvre Six avec le message copié, pour comprendre ce qu'il veut dire et choisir une réponse."
    )
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        // iOS demande l'autorisation de coller : rien n'est lu sans l'accord de l'utilisateur.
        if let texte = UIPasteboard.general.string {
            SixRaccourcis.preparerTexte(texte)
        }
        SixRaccourcis.ouvrir(.repondre)
        return .result()
    }
}

/// À utiliser dans un raccourci : « Prendre une capture d'écran », puis cette action. Le raccourci peut
/// ensuite être placé sur le bouton Action, AssistiveTouch (double toucher), le Centre de contrôle ou Toucher
/// le dos. Six lit la capture sur le téléphone ; rien n'est envoyé avant que l'utilisateur lance l'analyse.
@available(iOS 16.0, *)
struct AnalyserCaptureIntent: AppIntent {
    static var title: LocalizedStringResource = "Analyser une capture avec Six"
    static var description = IntentDescription(
        "Ouvre Six avec une capture d'écran de conversation, lue sur le téléphone, pour choisir une réponse."
    )
    static var openAppWhenRun = true

    @Parameter(title: "Capture", supportedTypeIdentifiers: ["public.png", "public.jpeg"])
    var capture: IntentFile

    static var parameterSummary: some ParameterSummary {
        Summary("Analyser \(\.$capture) avec Six")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard SixRaccourcis.preparerCapture(capture.data) else {
            throw $capture.needsValueError("Choisis une capture d'écran (PNG ou JPEG, 15 Mo au plus).")
        }
        SixRaccourcis.ouvrir(.repondre)
        return .result()
    }
}

@available(iOS 16.0, *)
struct OuvrirSevenAIIntent: AppIntent {
    static var title: LocalizedStringResource = "Parler à Seven AI"
    static var description = IntentDescription("Ouvre Seven AI, l'assistant de discussion de Six.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        SixRaccourcis.ouvrir(.sevenAI)
        return .result()
    }
}

@available(iOS 16.0, *)
struct QuoiDireIntent: AppIntent {
    static var title: LocalizedStringResource = "Quoi dire ?"
    static var description = IntentDescription("Des idées pour lancer ou relancer une conversation.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        SixRaccourcis.ouvrir(.sujets)
        return .result()
    }
}

/// Raccourcis prêts à l'emploi : Siri les reconnaît sans réglage, et ils apparaissent dans l'app Raccourcis,
/// la liste du bouton Action, le Centre de contrôle, l'écran verrouillé et AssistiveTouch.
/// Chaque phrase doit contenir le nom de l'app (\(.applicationName)).
@available(iOS 16.0, *)
struct SixAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RepondreAvecSixIntent(),
            phrases: [
                "Répondre avec \(.applicationName)",
                "Réponds avec \(.applicationName)",
                "Aide-moi à répondre avec \(.applicationName)",
                "Analyse le message copié avec \(.applicationName)",
            ]
        )
        AppShortcut(
            intent: OuvrirSevenAIIntent(),
            phrases: [
                "Ouvre Seven AI dans \(.applicationName)",
                "Parler à Seven AI avec \(.applicationName)",
            ]
        )
        AppShortcut(
            intent: QuoiDireIntent(),
            phrases: [
                "Quoi dire avec \(.applicationName)",
                "Donne-moi un sujet avec \(.applicationName)",
            ]
        )
    }
}

// MARK: - Écran « Siri et raccourcis » (ouvert depuis Réglages)

struct SixRaccourcisVue: View {
    let fermer: () -> Void

    var body: some View {
        NavigationView {
            List {
                Section {
                    Text("Lance Six d'un seul geste, sans ouvrir l'app d'abord. Copie un message, puis déclenche « Répondre avec Six » : Six s'ouvre avec le texte, prêt à être relu.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                Section(
                    header: Text("Un toucher pour répondre, deux pour une capture"),
                    footer: Text("Six lit la capture sur ton téléphone. Rien n'est envoyé avant que tu lances l'analyse.")
                ) {
                    Etape(numero: 1, texte: "App Raccourcis > + : ajoute « Répondre avec Six ». Nomme ce raccourci « Six – Répondre ».")
                    Etape(numero: 2, texte: "Nouveau raccourci : « Prendre une capture d'écran », puis « Analyser une capture avec Six ». Nomme-le « Six – Capture ».")
                    Etape(numero: 3, texte: "Réglages > Accessibilité > Toucher > AssistiveTouch : active-le, puis Simple toucher > « Six – Répondre » et Toucher deux fois > « Six – Capture ».")
                    Text("Un toucher sur la pastille ouvre Six avec le message copié ; deux touchers capturent l'écran (la pastille n'apparaît pas sur la capture) et l'ouvrent dans Six. Les mêmes raccourcis vont aussi sur le bouton Action ou sur Toucher le dos.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
                Section(header: Text("Ajouter les raccourcis")) {
                    if #available(iOS 17.0, *) {
                        ShortcutsLink()
                    } else {
                        Button("Ouvrir l'app Raccourcis") {
                            if let url = URL(string: "shortcuts://") { UIApplication.shared.open(url) }
                        }
                    }
                }
                Section(header: Text("Où les utiliser")) {
                    Ligne(icone: "mic.fill", titre: "Siri", texte: "« Dis Siri, répondre avec Six »")
                    Ligne(icone: "button.horizontal.top.press", titre: "Bouton Action",
                          texte: "Réglages > Bouton Action > Raccourci > Six (iPhone 15 Pro et plus récents)")
                    Ligne(icone: "lock.fill", titre: "Écran verrouillé et Centre de contrôle",
                          texte: "Touche longue sur l'écran verrouillé > Personnaliser, ou Centre de contrôle > Ajouter une commande (iOS 18)")
                    Ligne(icone: "circle.circle", titre: "AssistiveTouch",
                          texte: "Simple toucher : Six – Répondre ; Toucher deux fois : Six – Capture")
                }
                Section(header: Text("Liens"), footer: Text("Utilisables dans un raccourci « Ouvrir l'URL ».")) {
                    Text("six://repondre").font(.system(.body, design: .monospaced))
                    Text("six://seven-ai").font(.system(.body, design: .monospaced))
                    Text("six://sujets").font(.system(.body, design: .monospaced))
                }
            }
            .navigationTitle("Siri et raccourcis")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK", action: fermer)
                }
            }
        }
    }

    private struct Etape: View {
        let numero: Int
        let texte: String

        var body: some View {
            HStack(alignment: .top, spacing: 12) {
                Text("\(numero)")
                    .font(.footnote.bold())
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Color.accentColor.opacity(0.15)))
                Text(texte).font(.footnote)
            }
            .padding(.vertical, 2)
        }
    }

    private struct Ligne: View {
        let icone: String
        let titre: String
        let texte: String

        var body: some View {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: icone).frame(width: 24).foregroundColor(.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text(titre).font(.body)
                    Text(texte).font(.footnote).foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 2)
        }
    }
}

/// Présente l'écran « Siri et raccourcis » par-dessus l'app web.
enum SixRaccourcisEcran {
    @MainActor
    static func presenter(depuis controleur: UIViewController?) {
        guard let controleur else { return }
        var hote: UIHostingController<SixRaccourcisVue>?
        let vue = SixRaccourcisVue { hote?.dismiss(animated: true) }
        hote = UIHostingController(rootView: vue)
        if let hote { controleur.present(hote, animated: true) }
    }
}
