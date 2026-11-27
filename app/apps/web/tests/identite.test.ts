import { describe, expect, it } from 'vitest';
import { corrigerIdentite, reponseCreateur } from '@/lib/identite';

describe('identité de Six', () => {
  it('attribue la création de Six à Seven.AI', () => {
    expect(reponseCreateur("qui t'a crée")).toBe(
      'Je suis Six, un assistant développé par Seven.AI.',
    );
    expect(reponseCreateur('Qui a créé Anthropic ?')).toBeUndefined();
    expect(corrigerIdentite('Je suis Six, l’assistant de l’app Six, créée par Anthropic.')).toBe(
      'Je suis Six, l’assistant de l’app Six, créée par Seven.AI.',
    );
  });

  it('préserve la mise en forme du code', () => {
    const code = '<html>\n  <body>Bonjour</body>\n</html>';
    expect(corrigerIdentite(code)).toBe(code);
  });
  it('retire les dénégations fausses sur le modèle utilisé', () => {
    expect(
      corrigerIdentite(
        "Je suis Six, l'assistant de l'app Six, créée par Seven.AI. Je ne suis pas Qwen ni un autre assistant. Je fonctionne à partir de modèles existants.",
      ),
    ).toBe(
      "Je suis Six, l'assistant de l'app Six, créée par Seven.AI. Je fonctionne à partir de modèles existants.",
    );
    expect(corrigerIdentite("Je suis Six. Je ne suis ni Qwen ni ChatGPT ; je t'aide ici.")).toBe(
      "Je suis Six. Je t'aide ici.",
    );
    expect(corrigerIdentite('Je suis Six, et je ne suis pas basé sur Llama.')).toBe('Je suis Six.');
    expect(
      corrigerIdentite(
        'Je suis Six. Je ne suis pas Qwen, je suis développé par Seven.AI, sans détail technique. Bonne journée.',
      ),
    ).toBe('Je suis Six. Bonne journée.');
  });

  it('ne touche pas au reste', () => {
    const t = "Je ne suis pas sûr de la date. Qwen est un modèle open source d'Alibaba.";
    expect(corrigerIdentite(t)).toBe(t);
    expect(corrigerIdentite('Je suis Six, créé par Seven.AI.')).toBe(
      'Je suis Six, créé par Seven.AI.',
    );
  });
});
