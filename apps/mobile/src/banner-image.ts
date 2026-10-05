import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";

// Leave room for the API's JPEG re-encoding and 700 KB stored-image cap, as
// well as its 1 MB upload limit. Dimensions alone do not bound JPEG size.
const maxBannerBytes = 600 * 1024;

export async function prepareBannerImage(uri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  for (const edge of [1600, 1200, 800]) {
    let rendered = original;
    if (Math.max(original.width, original.height) > edge) {
      const context = ImageManipulator.manipulate(original);
      context.resize(
        original.width >= original.height ? { width: edge } : { height: edge },
      );
      rendered = await context.renderAsync();
    }
    const image = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.8,
    });
    const file = new File(image.uri);
    if (!file.exists || !file.size)
      throw new Error("Cannot prepare this image. Choose another banner.");
    if (file.size <= maxBannerBytes) return image.uri;
    file.delete();
  }
  throw new Error("This image is too detailed. Choose a smaller banner image.");
}
