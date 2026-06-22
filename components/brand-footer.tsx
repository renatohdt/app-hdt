import clsx from "clsx";

/**
 * Rodapé discreto, estilo app: redes sociais + dados da empresa.
 * Reutilizado na home, login e criar-conta para manter o padrão visual.
 */
export function BrandFooter({ className }: { className?: string }) {
  return (
    <footer className={clsx("flex flex-col items-center gap-3", className)}>
      <div className="flex items-center gap-5">
        <a
          href="https://instagram.com/horadotreino_oficial"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram da Hora do Treino"
          className="text-white/45 transition hover:text-primary"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
        </a>
        <a
          href="https://www.tiktok.com/@horadotreinooficial"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="TikTok da Hora do Treino"
          className="text-white/45 transition hover:text-primary"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.5 3c.3 2 1.5 3.6 3.5 4v2.6c-1.3 0-2.5-.4-3.6-1.1v5.6a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v2.7a2.9 2.9 0 1 0 2 2.8V3h2.8z" />
          </svg>
        </a>
        <a
          href="https://www.youtube.com/@HoradoTreino"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="YouTube da Hora do Treino"
          className="text-white/45 transition hover:text-primary"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5A2.7 2.7 0 0 0 2.4 7.2 28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8zM10 15V9l5 3-5 3z" />
          </svg>
        </a>
      </div>
      <p className="text-center text-[11px] text-white/35">
        Hora do Treino® · CNPJ 34.229.533/0001-61
      </p>
    </footer>
  );
}
