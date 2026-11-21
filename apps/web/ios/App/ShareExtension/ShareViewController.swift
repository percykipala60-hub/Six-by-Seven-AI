import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let preview = UILabel()
    private let message = UILabel()
    private let saveButton = UIButton(type: .system)
    private var sharedText = ""
    private var saved = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        preferredContentSize = CGSize(width: 0, height: 360)
        buildInterface()
        loadSharedText()
    }

    private func buildInterface() {
        let title = UILabel()
        title.text = "Partager avec Six"
        title.font = .preferredFont(forTextStyle: .title2).withTraits(.traitBold)

        message.text = "Six prépare le texte sur cet appareil. Il ne sera envoyé à l’IA que si tu lances une analyse dans Six."
        message.font = .preferredFont(forTextStyle: .subheadline)
        message.textColor = .secondaryLabel
        message.numberOfLines = 0

        preview.font = .preferredFont(forTextStyle: .body)
        preview.textColor = .label
        preview.numberOfLines = 5
        preview.lineBreakMode = .byTruncatingTail
        preview.backgroundColor = .secondarySystemBackground
        preview.layer.cornerRadius = 14
        preview.layer.masksToBounds = true

        saveButton.setTitle("Préparer dans Six", for: .normal)
        saveButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        saveButton.backgroundColor = .systemBlue
        saveButton.tintColor = .white
        saveButton.layer.cornerRadius = 14
        saveButton.heightAnchor.constraint(equalToConstant: 50).isActive = true
        saveButton.addTarget(self, action: #selector(saveDraft), for: .touchUpInside)

        let cancel = UIButton(type: .system)
        cancel.setTitle("Annuler", for: .normal)
        cancel.addTarget(self, action: #selector(cancelShare), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [title, message, preview, saveButton, cancel])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            preview.heightAnchor.constraint(greaterThanOrEqualToConstant: 84),
        ])
    }

    private func loadSharedText() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            message.text = "Aucun texte à importer."
            saveButton.isEnabled = false
            return
        }

        let group = DispatchGroup()
        let lock = NSLock()
        var parts: [String] = []

        for item in items {
            if let text = item.attributedContentText?.string, !text.isEmpty {
                parts.append(text)
            }
            for provider in item.attachments ?? [] {
                let type = provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
                    ? UTType.plainText.identifier
                    : (provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) ? UTType.url.identifier : nil)
                guard let type else { continue }
                group.enter()
                provider.loadItem(forTypeIdentifier: type, options: nil) { value, _ in
                    let text = (value as? String)
                        ?? (value as? URL)?.absoluteString
                        ?? (value as? NSAttributedString)?.string
                    if let text, !text.isEmpty {
                        lock.lock()
                        parts.append(text)
                        lock.unlock()
                    }
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            let text = parts.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            self?.sharedText = String(text.prefix(2000))
            self?.preview.text = self?.sharedText.isEmpty == false ? self?.sharedText : "Cette app ne partage pas de texte lisible."
            self?.saveButton.isEnabled = !(self?.sharedText.isEmpty ?? true)
        }
    }

    @objc private func saveDraft() {
        guard !sharedText.isEmpty,
              let shared = UserDefaults(suiteName: "group.com.sevenai.six") else {
            message.text = "Six n’a pas pu préparer ce texte. Il n’a pas été transmis."
            return
        }
        shared.set(sharedText, forKey: "sharedDraft")
        saved = true
        message.text = "Texte préparé sur cet appareil. Ouvre Six pour le relire et choisir si tu veux l’analyser."
        saveButton.setTitle("Terminer", for: .normal)
        saveButton.removeTarget(self, action: #selector(saveDraft), for: .touchUpInside)
        saveButton.addTarget(self, action: #selector(finishShare), for: .touchUpInside)
    }

    @objc private func finishShare() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    @objc private func cancelShare() {
        extensionContext?.cancelRequest(withError: NSError(domain: "SixShare", code: 1))
    }
}

private extension UIFont {
    func withTraits(_ traits: UIFontDescriptor.SymbolicTraits) -> UIFont {
        UIFont(descriptor: fontDescriptor.withSymbolicTraits(traits) ?? fontDescriptor, size: pointSize)
    }
}
