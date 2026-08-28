/** رسالة حالة صغيرة تحت كل شاشة */
export default function Note({ note }) {
  if (!note || !note.text) return null;
  return <div className={`qbi-msg ${note.kind || 'info'}`} dangerouslySetInnerHTML={{ __html: note.text }} />;
}
