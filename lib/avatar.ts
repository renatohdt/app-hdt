// ─────────────────────────────────────────────────────────────────────────────
// Rostos do Renato (avatar do personal) — imagens em public/avatar/
//
// Recorte só do rosto, com contorno verde desfocado e a parte de baixo já
// esmaecida na própria imagem. Para usar em outra tela:
//   <img src={avatarSrc("joinha")} ... />
// Para adicionar uma expressão nova: salve public/avatar/renato-<nome>.webp
// e acrescente o <nome> na lista abaixo.
// ─────────────────────────────────────────────────────────────────────────────

export const AVATAR_EXPRESSIONS = [
  "acenando",
  "apontando-eu",
  "bora",
  "bora-2",
  "desconfiado",
  "explicando",
  "explicando-2",
  "fofoqueiro",
  "impressionado",
  "joinha",
  "joinha-piscada",
  "neutro",
  "pensativo",
  "premium",
  "sonhando",
  "triste"
] as const;

export type AvatarExpression = (typeof AVATAR_EXPRESSIONS)[number];

export function avatarSrc(expression: AvatarExpression = "neutro") {
  return `/avatar/renato-${expression}.webp`;
}
