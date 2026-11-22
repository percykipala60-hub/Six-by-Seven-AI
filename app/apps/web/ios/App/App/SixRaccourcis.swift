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
                          texte: "Réglages > Accessibilité > Toucher > AssistiveTouch > Simple toucher > Six")
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
