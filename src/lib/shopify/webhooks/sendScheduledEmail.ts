'use server'

import { BasePayload, getPayload, PaginatedDocs, type Where } from 'payload'
import configPromise from '@payload-config'
import { buildPostOrderEmail } from '../../../utilities/email_templates/buildPostOrderEmail'
import { ScheduledEmail } from '../../../payload-types'
import { env } from '@/lib/env'

type ResultsT = Array<{ email: string; status: string; errorMessage?: string }>

export async function sendEmailsManually({ ids }: { ids: string[] }): Promise<ResultsT> {
  if (!ids || ids.length === 0) throw new Error('No email IDs provided for manual sending')

  const payload = await getPayload({ config: configPromise })
  const results: ResultsT = []

  const scheduled = await payload.find({
    collection: 'scheduled-emails',
    where: { id: { in: ids } },
  })

  if (scheduled.totalDocs === 0) throw new Error('No scheduled emails found with the provided IDs')

  return await sendAndUpdateCollection(payload, scheduled, results)
}

export async function sendScheduledEmail({
  limit = 100,
}: {
  limit?: number
} = {}): Promise<ResultsT> {
  const payload = await getPayload({ config: configPromise })
  const now = new Date().toISOString()
  const results: ResultsT = []

  // Skip bulk expiration processing if targeting specific IDs
  const processedExpiredEmails = await processExpiredEmails(payload, now, limit)
  results.push(...processedExpiredEmails)

  const scheduled = await payload.find({
    collection: 'scheduled-emails',
    limit: limit, // batching safety
    where: {
      and: [
        { status: { equals: 'pending' } },
        { scheduledAt: { less_than_equal: now } },
        { expiresAt: { greater_than: now } },
      ],
    },
  })

  if (scheduled.totalDocs === 0) {
    console.log(`No scheduled emails found`)
    return results
  }
  console.log(`💥 Processing batch of ${scheduled.docs.length} scheduled emails...`)

  return await sendAndUpdateCollection(payload, scheduled, results)
}

async function sendAndUpdateCollection(
  payload: BasePayload,
  scheduled: PaginatedDocs<ScheduledEmail>,
  results: ResultsT,
) {
  const emailContent = await payload.findGlobal({ slug: 'email-content' })

  // this is defensive - it shouldnt't be possible
  for (const doc of scheduled.docs as unknown as ScheduledEmail[]) {
    if (!doc.token || !doc.customerEmail) {
      console.error(` ❌ ${doc.id} is missing required data - aborting`)
      await payload.update({
        collection: 'scheduled-emails',
        id: doc.id,
        data: { status: 'failed' },
      })
      results.push({
        email: doc.customerEmail ?? 'Missing email ',
        status: 'failed',
        errorMessage: 'Missing required data',
      })

      continue
    }

    const baseUrl: string = env.NEXT_PUBLIC_SERVER_URL

    const linkUrl: string = `${baseUrl}/ankieta/${doc.token}`
    console.log('linkUrl: ', linkUrl, 'baseUrl: ', baseUrl)
    const { subject, html } = buildPostOrderEmail(linkUrl, emailContent.surveyInvitation)

    await payload.sendEmail({
      to: doc.customerEmail,
      subject,
      html,
    })

    await payload.update({
      collection: 'scheduled-emails',
      id: doc.id,
      data: { status: 'sent' },
    })

    results.push({ email: doc.customerEmail, status: 'sent' })
  }
  return results
}

async function processExpiredEmails(
  payload: BasePayload,
  now: string,
  limit: number,
): Promise<ResultsT> {
  // We will try retrying sending emails for a certain amount of time, after that we will permanently set the status to failed

  const results: ResultsT = []

  const expired = await payload.find({
    collection: 'scheduled-emails',
    limit: limit,
    where: {
      and: [{ status: { equals: 'pending' } }, { expiresAt: { less_than_equal: now } }],
    },
  })

  for (const doc of expired.docs) {
    await payload.update({
      collection: 'scheduled-emails',
      id: doc.id,
      data: { status: 'failed' },
    })
    results.push({
      email: doc.customerEmail,
      status: 'failed',
      errorMessage: 'Sending failed repeatedly',
    })
  }
  return results
}
