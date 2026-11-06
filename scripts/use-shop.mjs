// Admin scripts work on one shop at a time: SHOP=<slug>.
// Row-level security then limits every query in the script to that shop.
export async function useShop(client) {
  const slug = (process.env.SHOP || "").trim().toLowerCase();
  if (!slug) { console.error("Set SHOP=<shop-slug> first, e.g. SHOP=joes-garage."); process.exit(1); }
  const { rows } = await client.query("select id, name from shops where slug = $1", [slug]);
  if (!rows[0]) { console.error(`No shop "${slug}". Set SHOP=<slug>.`); process.exit(1); }
  await client.query("select set_config('app.shop_id', $1, false)", [rows[0].id]);
  console.log(`Shop: ${rows[0].name} (${slug})`);
  return rows[0];
}
