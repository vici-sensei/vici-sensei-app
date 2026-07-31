export interface DiffChar {
  char: string;
  match: boolean;
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
