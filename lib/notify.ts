import { getDb } from "./db";
import { sendEmail, shiftEmailHtml } from "./email";

// Benachrichtigt alle Mitglieder des einer Schicht zugewiesenen Teams per E-Mail.
// Gibt eine Zusammenfassung zurück; protokolliert jede Mail in notifications_log.
export async function notifyShiftTeam(shiftId: number): Promise<{ sent: number; skipped: number; failed: number; members: number; teamName: string | null }> {
  const db = getDb();
  const shift = db.prepare(`
    SELECT s.id, s.task, s.date, s.start_time, s.end_time, s.team_id, s.tournament_id,
      t.name AS team_name, tr.name AS tournament_name
    FROM shifts s
    LEFT JOIN teams t ON s.team_id = t.id
    LEFT JOIN tournaments tr ON s.tournament_id = tr.id
    WHERE s.id = ?
  `).get(shiftId) as {
    id: number; task: string; date: string; start_time: string; end_time: string;
    team_id: number | null; tournament_id: number | null; team_name: string | null; tournament_name: string | null;
  } | undefined;

  if (!shift || !shift.team_id) return { sent: 0, skipped: 0, failed: 0, members: 0, teamName: null };

  const members = db.prepare(`
    SELECT h.id, h.first_name, h.email FROM team_members tm
    JOIN helpers h ON tm.helper_id = h.id WHERE tm.team_id = ?
  `).all(shift.team_id) as { id: number; first_name: string; email: string }[];

  const leads = db.prepare(`
    SELECT h.first_name, h.last_name FROM team_leads tl
    JOIN helpers h ON tl.helper_id = h.id WHERE tl.team_id = ?
  `).all(shift.team_id) as { first_name: string; last_name: string }[];
  const responsible = leads.map(l => `${l.first_name} ${l.last_name}`.trim()).join(", ");

  let sent = 0, skipped = 0, failed = 0;
  for (const m of members) {
    const status = await sendEmail({
      to: m.email,
      subject: `Einteilung: ${shift.task} am ${shift.date}`,
      html: shiftEmailHtml({
        firstName: m.first_name,
        event: shift.tournament_name ?? "",
        task: shift.task,
        date: shift.date,
        time: `${shift.start_time}–${shift.end_time}`,
        responsible,
        teamName: shift.team_name ?? "",
      }),
      kind: "shift_assignment",
      helperId: m.id,
      context: { shift_id: shift.id, team_id: shift.team_id, task: shift.task, date: shift.date },
    });
    if (status === "sent") sent++; else if (status === "failed") failed++; else skipped++;
  }
  return { sent, skipped, failed, members: members.length, teamName: shift.team_name };
}
