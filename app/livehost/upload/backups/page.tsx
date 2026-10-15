import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isWorkspaceOwner } from "@/lib/admin";
import { listRawBackups } from "../../lib/backups";

export const dynamic = "force-dynamic";

export default async function RawBackups({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireChatGPTUser("/livehost/upload/backups");
  if (!isWorkspaceOwner(user.email)) return <main><h2>Owner access required</h2></main>;
  const query = await searchParams;
  const page = /^\d{1,6}$/.test(query.page ?? "") ? Math.max(0, Number(query.page) - 1) : 0;
  const { files, hasMore } = await listRawBackups(page * 50);
  return <>
    <nav className="topbar"><Link href="/livehost">Dashboard</Link><Link href="/livehost/reports">Monthly reports</Link><Link href="/livehost/upload">Upload Report</Link></nav>
    <main><section className="section"><h2>Original file archive</h2>
      <p>Private cloud copies. Removing files from your computer does not remove these originals.</p>
      <div className="table-wrap"><table><thead><tr><th>Uploaded</th><th>Original file</th><th>Report dates</th><th>Bytes</th><th>Uploaded by</th></tr></thead>
        <tbody>{files.map(file => <tr key={file.id}>
          <td>{new Date(file.created_at).toLocaleString("en-MY")}</td>
          <td><a href={`/api/livehost/backups/${file.id}`}>{file.file_name}</a></td><td>{file.date_range}</td><td>{file.size_bytes.toLocaleString("en-MY")}</td><td>{file.uploaded_by_email}</td>
        </tr>)}</tbody></table></div>
      {!files.length ? <p>No archived files on this page.</p> : null}
      <p>{page > 0 ? <Link href={`/livehost/upload/backups?page=${page}`}>Newer files</Link> : null}{hasMore ? <Link href={`/livehost/upload/backups?page=${page + 2}`} style={{ marginLeft: 20 }}>Older files</Link> : null}</p>
    </section></main>
  </>;
}
