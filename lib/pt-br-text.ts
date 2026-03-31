const MOJIBAKE_MARKERS = /[\u00c3\u00c2\uFFFD]|\u00e2[\u0080-\u00bf]/;

function getMojibakeScore(value: string) {
  return (value.match(MOJIBAKE_MARKERS) ?? []).length;
}

function decodeLikelyMojibake(value: string) {
  if (!MOJIBAKE_MARKERS.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "");

    if (!decoded) {
      return value;
    }

    return getMojibakeScore(decoded) < getMojibakeScore(value) ? decoded : value;
  } catch {
    return value;
  }
}

export function repairPtBrText(value?: string | null) {
  const raw = value?.replace(/\u00a0/g, " ").trim();

  if (!raw) {
    return "";
  }

  let next = raw;

  for (let index = 0; index < 2; index += 1) {
    const repaired = decodeLikelyMojibake(next);

    if (repaired === next) {
      break;
    }

    next = repaired;
  }

  return next;
}

export function normalizePtBrUiText(value?: string | null) {
  return repairPtBrText(value).replace(/\s+/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();
}
