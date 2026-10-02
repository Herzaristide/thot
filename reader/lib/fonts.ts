import { Inter, Literata, Source_Serif_4 } from "next/font/google";

// `subsets` ne règle que le préchargement : les autres alphabets (cyrillique,
// grec…) restent déclarés et se chargent à la demande (unicode-range).
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  style: ["normal", "italic"],
});
// Police au choix dans les réglages : pas de préchargement
export const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  style: ["normal", "italic"],
  preload: false,
});
