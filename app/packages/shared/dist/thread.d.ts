/**
 * Lecture d'une conversation : exports WhatsApp Android et iPhone, ou texte collé « Nom: message ».
 * Les lignes système (chiffrement, « <Médias omis> ») sont ignorées ; un message sur plusieurs
 * lignes reste un seul message.
 */
export interface ThreadMessage {
    author?: string;
    date?: string;
    time?: string;
    text: string;
}
export declare function parseThread(raw: string): ThreadMessage[];
/** « Vous », « moi »… : le nom que WhatsApp donne à l'utilisateur, pas un vrai prénom. */
export declare function isSelfAlias(name: string | undefined): boolean;
export declare function authorsOf(messages: ThreadMessage[]): string[];
/**
 * Trouve l'utilisateur parmi les auteurs : le nom donné s'il existe, sinon « Vous » / « You »
 * (nom donné par WhatsApp à la personne qui exporte). undefined si aucun ne correspond.
 */
export declare function resolveMe(messages: ThreadMessage[], moi?: string): string | undefined;
