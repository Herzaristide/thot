import { Inter, Literata } from "next/font/google";

// `subsets` ne règle que le préchargement : les autres alphabets (cyrillique,
// grec…) restent déclarés et se chargent à la demande (unicode-range).
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Textes du corpus (atelier d'alignement, aperçus)
export const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  style: ["normal", "italic"],
});
