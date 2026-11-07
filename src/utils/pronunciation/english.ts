import { franc } from "franc"

// Short isolated words do not carry enough trigrams for language detection.
// Common words are unambiguous enough for this affordance; other short words
// need an English surrounding passage. Unknown text stays hidden, never calls AI.
const common = new Set(
  `a an the i me my mine we us our ours you your yours he him his she her hers it its they them their theirs this that these those am is are was were be been being have has had do does did will would shall should can could may might must not no yes and or but if then than as at by for from in into of off on onto out over under to up with without about again all also any back because before after between both each either every few first get go good great here how just know last like little look make many more most much new next now old one only other own people read right same say see so some such take tell there think time too two use very want way well what when where which who why word work world write learn learning english american pronunciation hello please thank thanks thankyou today tomorrow yesterday practice listen speak sentence clear voice repeat test water book better friend school word stress sound comfortable computer dictionary language vocabulary cat dog apple orange beautiful important difficult remember understand translate translation what’s don’t doesn’t didn’t isn’t aren’t wasn’t weren’t won’t can’t couldn’t shouldn’t i’m i’ve i’ll you’re we’re they’re it’s let’s`.split(
    /\s+/,
  ),
)
export function isEnglishPracticeText(text: string | null | undefined, context = ""): boolean {
  const selected = text?.normalize("NFC").trim() ?? ""
  if (!selected || selected.length > 20000) return false
  // Do not mistake Latin punctuation/digits in Vietnamese, CJK or code for English.
  const letters = selected.match(/\p{L}/gu) ?? []
  if (!letters.length || letters.some((letter) => !/^[a-z]$/i.test(letter))) return false
  const words =
    selected
      .toLowerCase()
      .replaceAll("'", "’")
      .match(/[a-z]+(?:’[a-z]+)*/g) ?? []
  if (!words.length || /[{}<>_=\\]/.test(selected)) return false
  if (words.every((word) => common.has(word))) return true
  // Trigram ranking is unreliable on short sentences. Several independent
  // English words are useful positive evidence without accepting all Latin text.
  const known = words.filter((word) => common.has(word))
  if (new Set(known).size >= 3 && known.length / words.length >= 0.5) return true
  if (words.length >= 4 || letters.length >= 45) return franc(selected, { minLength: 10 }) === "eng"
  // Use only genuine surrounding context, never an unrelated cached language.
  const passage = context.normalize("NFC").trim().slice(0, 2000)
  if (passage.length >= 30 && passage.toLowerCase().includes(selected.toLowerCase()))
    return franc(passage, { minLength: 20 }) === "eng"
  return selected.length >= 10 && franc(selected, { minLength: 10 }) === "eng"
}
