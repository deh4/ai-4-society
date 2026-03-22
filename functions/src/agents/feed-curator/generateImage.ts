// functions/src/agents/feed-curator/generateImage.ts
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { GoogleAuth } from "google-auth-library";

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "";
const LOCATION = "us-central1";
const MODEL = "imagen-3.0-fast-generate-001";
const ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

export async function generateEditorialImage(
  hookId: string,
  title: string,
  hookText: string,
): Promise<string | null> {
  try {
    const client = await auth.getClient();
    const accessToken = (await client.getAccessToken()).token;

    const prompt = `Editorial illustration for a news article about AI and society: "${title}". ${hookText}. Style: abstract, modern, dark moody color palette.`;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "16:9",
          outputOptions: { mimeType: "image/webp" },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`Imagen API error (${res.status}): ${errText}`);
      return null;
    }

    const data = await res.json() as {
      predictions?: Array<{ bytesBase64Encoded?: string }>;
    };

    const imageBase64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!imageBase64) {
      logger.warn(`No image generated for hook ${hookId}`);
      return null;
    }

    // Upload to Firebase Storage
    const bucket = getStorage().bucket();
    const filePath = `editorial-images/${hookId}.webp`;
    const file = bucket.file(filePath);

    const buffer = Buffer.from(imageBase64, "base64");
    await file.save(buffer, {
      contentType: "image/webp",
      metadata: { cacheControl: "public, max-age=31536000" },
    });

    // Make file publicly readable for a permanent URL (no expiry)
    await file.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // Write back to editorial hook
    const db = getFirestore();
    await db.collection("editorial_hooks").doc(hookId).update({
      image_url: url,
    });

    logger.info(`Generated and stored image for hook ${hookId}`);
    return url;
  } catch (err) {
    logger.error(`Failed to generate image for hook ${hookId}:`, err);
    return null;
  }
}
