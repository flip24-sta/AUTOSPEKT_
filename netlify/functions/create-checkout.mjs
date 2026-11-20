import { json, getUser, readBody, userError, methodNotAllowed, siteUrl } from '../lib/shared.mjs';

const products = { buy: 'STRIPE_PRICE_BUY', sell: 'STRIPE_PRICE_SELL', complete: 'STRIPE_PRICE_FULL' };

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  try {
    const user = await getUser(event);
    const { product } = readBody(event);
    if (!products[product]) return json(400, { error: 'Neplatný produkt.' });
    const price = process.env[products[product]];
    if (!price || !process.env.STRIPE_SECRET_KEY) return json(503, { error: 'Platby nie sú nakonfigurované. Doplň Stripe kľúč a cenové ID v Netlify.' });
    const form = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      client_reference_id: user.id,
      'metadata[user_id]': user.id,
      'metadata[product]': product,
      success_url: `${siteUrl()}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/?payment=cancelled`,
      billing_address_collection: 'required',
      locale: 'sk',
    });
    if (user.email) form.set('customer_email', user.email);
    const stripeAuth = Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64');
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Basic ${stripeAuth}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form });
    const session = await response.json();
    if (!response.ok) throw Object.assign(new Error('Platbu sa nepodarilo spustiť. Skontroluj Stripe cenu a menu.'), { statusCode: 502 });
    return json(200, { url: session.url });
  } catch (error) { return userError(error); }
};
