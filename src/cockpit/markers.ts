import { AR } from "js-aruco2";
import { MARKER_DICTIONARY, TARGET_IDS } from "../shared/targets";

const dictionary = new AR.Dictionary(MARKER_DICTIONARY);
const container = document.querySelector<HTMLElement>("#targets")!;

for (const id of TARGET_IDS) {
  const figure = document.createElement("figure");
  figure.innerHTML = `${dictionary.generateSVG(id)}<figcaption>TGT ${id}</figcaption>`;
  container.append(figure);
}
