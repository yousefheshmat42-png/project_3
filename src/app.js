import { createCore, text, integer, id, page, transaction, fail } from './core.js';
function timestamp(value) {
  // Require UTC explicitly so callers cannot accidentally use local wall time.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) fail(400, 'Use UTC ISO timestamp, e.g. 2030-05-20T09:00:00Z');
  const ms = Date.parse(value);
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== canonical || ms <= Date.now()) fail(400, 'Time must be a valid future UTC timestamp');
  return ms;
}
export function createApp({ databasePath = ':memory:', adminKey } = {}) {
  const { app, db, auth, admin, finish } = createCore(databasePath, adminKey);
  db.exec(`
    CREATE TABLE IF NOT EXISTS slots(id INTEGER PRIMARY KEY, provider TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL CHECK(ends_at > starts_at));
    CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), slot_id INTEGER NOT NULL REFERENCES slots(id), status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')));
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking ON bookings(slot_id) WHERE status = 'confirmed';
    CREATE INDEX IF NOT EXISTS provider_times ON slots(provider,starts_at,ends_at);
    CREATE INDEX IF NOT EXISTS bookings_owner ON bookings(user_id);
  `);
  const viewSlot = slot => ({ ...slot, starts_at: new Date(slot.starts_at).toISOString(), ends_at: new Date(slot.ends_at).toISOString() });
  app.post('/slots', admin, (req, res) => {
    const provider = text(req.body.provider, 'provider', 80).toLowerCase();
    const start = timestamp(req.body.starts_at), end = timestamp(req.body.ends_at);
    if (end <= start || end - start > 8 * 60 * 60 * 1000) fail(400, 'Slot duration must be positive and at most 8 hours');
    const result = transaction(db, () => {
      if (db.prepare('SELECT id FROM slots WHERE provider = ? AND starts_at < ? AND ends_at > ?').get(provider, end, start)) fail(409, 'Provider already has an overlapping slot');
      const inserted = db.prepare('INSERT INTO slots(provider,starts_at,ends_at) VALUES(?,?,?)').run(provider, start, end);
      return db.prepare('SELECT * FROM slots WHERE id = ?').get(inserted.lastInsertRowid);
    });
    res.status(201).json(viewSlot(result));
  });
  app.get('/slots', (req, res) => {
    const { limit, offset } = page(req.query);
    const provider = req.query.provider === undefined ? null : text(req.query.provider, 'provider', 80).toLowerCase();
    const slots = db.prepare(`SELECT * FROM slots s WHERE starts_at > ? AND (? IS NULL OR provider = ?)
      AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id = s.id AND b.status = 'confirmed')
      ORDER BY starts_at, id LIMIT ? OFFSET ?`).all(Date.now(), provider, provider, limit, offset);
    res.json({ items: slots.map(viewSlot) });
  });
  app.post('/bookings', auth, (req, res) => {
    const slotId = integer(req.body.slot_id, 'slot_id');
    const booking = transaction(db, () => {
      const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
      if (!slot) fail(404, 'Slot not found');
      if (slot.starts_at <= Date.now()) fail(409, 'Slot is in the past');
      if (db.prepare("SELECT id FROM bookings WHERE slot_id = ? AND status = 'confirmed'").get(slotId)) fail(409, 'Slot already booked');
      const result = db.prepare('INSERT INTO bookings(user_id,slot_id) VALUES(?,?)').run(req.userId, slotId);
      return db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
    });
    res.status(201).json(booking);
  });
  app.get('/bookings', auth, (req, res) => {
    const { limit, offset } = page(req.query);
    const items = db.prepare('SELECT b.*,s.provider,s.starts_at,s.ends_at FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE b.user_id = ? ORDER BY b.id DESC LIMIT ? OFFSET ?').all(req.userId, limit, offset);
    res.json({ items: items.map(viewSlot) });
  });
  app.patch('/bookings/:id/cancel', auth, (req, res) => {
    const bookingId = id(req.params.id);
    const booking = db.prepare('SELECT b.*,s.starts_at FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE b.id = ? AND b.user_id = ?').get(bookingId, req.userId);
    if (!booking) fail(404, 'Booking not found');
    if (booking.starts_at <= Date.now()) fail(409, 'Past bookings cannot be cancelled');
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND user_id = ?").run(bookingId, req.userId);
    res.json(db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId));
  });
  return finish();
}

