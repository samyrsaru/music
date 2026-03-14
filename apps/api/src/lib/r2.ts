import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.warn('R2 environment variables not fully configured. R2 uploads will be disabled.')
}

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || '',
    secretAccessKey: R2_SECRET_ACCESS_KEY || '',
  },
})

export async function uploadAudioToR2(
  audioBuffer: Buffer,
  key: string,
  contentType: string = 'audio/mpeg'
): Promise<string> {
  if (!R2_BUCKET_NAME) {
    throw new Error('R2_BUCKET_NAME not configured')
  }

  const upload = new Upload({
    client: r2Client,
    params: {
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: audioBuffer,
      ContentType: contentType,
      // Private by default - no ACL set
    },
  })

  await upload.done()

  console.log(`✅ Uploaded to R2: ${key}`)

  // Return the key - we'll generate signed URLs when needed
  return key
}

export async function getSignedAudioUrl(
  key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  if (!R2_BUCKET_NAME) {
    throw new Error('R2_BUCKET_NAME not configured')
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: 'attachment; filename="makemusic.mp3"',
  })

  const signedUrl = await getSignedUrl(r2Client, command, {
    expiresIn: expiresInSeconds,
  })

  return signedUrl
}

export async function downloadAudioFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function deleteAudioFromR2(key: string): Promise<void> {
  if (!R2_BUCKET_NAME) {
    throw new Error('R2_BUCKET_NAME not configured')
  }

  await r2Client.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  }))

  console.log(`🗑️ Deleted from R2: ${key}`)
}
