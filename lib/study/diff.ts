export interface DiffChar {
  char: string;
  match: boolean;
}

/** An answer as it is shown in the "what you typed vs. the right answer" hint -- unlike the
 * letters-only key the answer matchers compare on, punctuation and symbols stay as typed ("to-
 * become" shows as "to- become", not "tobecome"); only runs of whitespace are collapsed to one space
 * and trimmed. Only ever fed into a diff after the strict comparison has already failed, so it never
 * affects correct/incorrect -- purely how the hint is displayed. */
export function normalizeDiffDisplay(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildEditDistanceTable(a: string, b: string): number[][] {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

export function levenshteinDistance(a: string, b: string): number {
  const dp = buildEditDistanceTable(a, b);
  return dp[a.length][b.length];
}

function longestCommonSubsequence(a: string, b: string): number {
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    prev = row;
  }
  return prev[b.length];
}

/** Share of letters a wrong answer must have in common with an accepted answer (see
 * resemblesAnswer) to be diffed against it rather than against the first accepted answer. */
const MIN_SHARED_CHARS = 0.5;

/** Whether wrong answer `a` resembles accepted answer `b` (`distance` = levenshteinDistance(a, b))
 * closely enough for a diff against `b` to mean anything. Two conditions:
 *  - at least half of their chars in common, in order: 2 * LCS / (|a| + |b|) >= MIN_SHARED_CHARS.
 *    Below that the overlap is coincidence ("soul" vs "mood", "death" vs "birth") and the edit
 *    distance mostly measures length, so short answers win ("atmo" was "closest" to "air");
 *  - at least one char kept in place by the edit-distance alignment the diff is drawn from -- when
 *    the distance is just the longer length, every char is substituted, inserted or deleted, and
 *    the diff would show no match at all.
 * The answer matchers only rank answers passing this, and fall back to the first accepted answer
 * when none does. */
export function resemblesAnswer(a: string, b: string, distance: number): boolean {
  if (distance >= Math.max(a.length, b.length)) return false;
  return (2 * longestCommonSubsequence(a, b)) / (a.length + b.length) >= MIN_SHARED_CHARS;
}

// Alignment (which chars are "equal") is decided on the lowercased *Compare
// strings, but the chars pushed into the diff come from the *Display strings
// -- so the rendered diff keeps original casing while matching stays
// case-insensitive. Both pairs have equal length/positions since Display and
// Compare differ only by .toLowerCase().
export function levenshteinAlign(
  aCompare: string,
  aDisplay: string,
  bCompare: string,
  bDisplay: string
): { userDiff: DiffChar[]; targetDiff: DiffChar[] } {
  const dp = buildEditDistanceTable(aCompare, bCompare);
  const userDiff: DiffChar[] = [];
  const targetDiff: DiffChar[] = [];
  let i = aCompare.length;
  let j = bCompare.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aCompare[i - 1] === bCompare[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      userDiff.push({ char: aDisplay[i - 1], match: true });
      targetDiff.push({ char: bDisplay[j - 1], match: true });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      userDiff.push({ char: aDisplay[i - 1], match: false });
      targetDiff.push({ char: bDisplay[j - 1], match: false });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      userDiff.push({ char: aDisplay[i - 1], match: false });
      i--;
    } else {
      targetDiff.push({ char: bDisplay[j - 1], match: false });
      j--;
    }
  }
  userDiff.reverse();
  targetDiff.reverse();
  return { userDiff, targetDiff };
}
