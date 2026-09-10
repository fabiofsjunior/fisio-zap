const notifications = [
  { type: 'attention', title: 'Reavaliação próxima', text: 'Maria está próxima da reavaliação.' },
  { type: 'attention', title: 'Evolução pendente', text: 'A evolução de João precisa ser revisada.' },
  { type: 'info', title: 'Rotina organizada', text: 'Sua agenda de hoje está pronta para consulta.' },
];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <div><span className="eyebrow">ASSISTENTE PROFISSIONAL</span><h1>FisioZap</h1></div>
        <div className="status">● Ambiente de testes</div>
      </header>
      <section className="hero">
        <div><p className="eyebrow">BEM-VINDA</p><h2>Seu trabalho. Seu método. Seu assistente.</h2><p>Organize pacientes, agenda, atendimentos, protocolos e pendências em um só lugar.</p></div>
        <div className="prompt"><span>WhatsApp</span><strong>“Qual minha rotina hoje?”</strong><small>O assistente consulta seus dados e apresenta o que merece atenção.</small></div>
      </section>
      <section className="grid">
        <article><span>📅</span><h3>Minha rotina</h3><p>Atendimentos de hoje e próximos compromissos.</p></article>
        <article><span>🔔</span><h3>Notificações</h3><p>Pendências e pontos de atenção centralizados.</p></article>
        <article><span>👥</span><h3>Pacientes</h3><p>Histórico, sessões e acompanhamento.</p></article>
        <article><span>🧠</span><h3>Meu método</h3><p>Exercícios, habilidades e protocolos próprios.</p></article>
      </section>
      <section className="panel"><div className="panel-head"><div><span className="eyebrow">CENTRAL</span><h2>Notificações</h2></div><span className="count">3</span></div>{notifications.map((n) => <div className="notification" key={n.title}><span className={`dot ${n.type}`} /><div><strong>{n.title}</strong><p>{n.text}</p></div><button>Ver</button></div>)}</section>
    </main>
  );
}
