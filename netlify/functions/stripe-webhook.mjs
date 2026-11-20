import { createHmac, timingSafeEqual } from 'node:crypto';
import { db, json, userError, methodNotAllowed } from '../lib/shared.mjs';

function verifyStripeSignature(raw, header, secret) {
  const parts = Object.fromEntries(String(header || '').split(',').map(piece => piece.split('=')));
  const signed = Buffer.concat([Buffer.from(`${parts.t}.`), raw]);
  const expected = createHmac('sha256', secret).update(signed).digest('hex');
  const actual = Buffer.from(parts.v1 || '', 'hex');
  const target = Buffer.from(expected, 'hex');
  return Boolean(parts.t && actual.length === target.length && timingSafeEqual(actual, target) && Math.abs(Date.now() / 1000 - Number(parts.t)) <= 300);
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) return json(503, { error: 'Stripe webhook nie je nakonfigurovaný.' });
    const signature = event.headers?.['stripe-signature'];
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : Buffer.from(event.body || '', 'utf8');
    if (!verifyStripeSignature(raw, signature, process.env.STRIPE_WEBHOOK_SECRET)) return json(400, { error: 'Neplatný podpis Stripe webhooku.' });
    const checkout = JSON.parse(raw.toString('utf8'));
    if (checkout.type === 'checkout.session.completed' || checkout.type === 'checkout.session.async_payment_succeeded') {
      const session = checkout.data.object;
      if (session.payment_status === 'paid' && session.metadata?.user_id && ['buy','sell','complete'].includes(session.metadata?.product)) {
        await db('purchases?on_conflict=stripe_checkout_session_id', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=minimal',
          body: [{ user_id: session.metadata.user_id, product: session.metadata.product, stripe_checkout_session_id: session.id, stripe_payment_intent_id: session.payment_intent || null, stripe_customer_id: session.customer || null, status: 'active' }],
        });
      }
    }
    if (checkout.type === 'charge.refunded') {
      const paymentIntent=checkout.data.object.payment_intent;
      if(paymentIntent){
        const purchases=await db(`purchases?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntent)}&select=user_id`);
        await db(`purchases?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntent)}`,{method:'PATCH',prefer:'return=minimal',body:{status:'refunded'}});
        for(const purchase of purchases){
          const active=await db(`purchases?user_id=eq.${purchase.user_id}&status=eq.active&product=in.(sell,complete)&select=id&limit=1`);
          await db(`listings?seller_id=eq.${purchase.user_id}&status=eq.active`,{method:'PATCH',prefer:'return=minimal',body:{academy_priority:active.length>0}});
        }
      }
    }
    return json(200, { received: true });
  } catch (error) { return userError(error); }
};
