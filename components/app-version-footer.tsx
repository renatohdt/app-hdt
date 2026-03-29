import Link from "next/link";
import Image from "next/image";

const footerLogoSrc = "https://horadotreino.com.br/wp-content/uploads/2026/03/logo-branco.png";

export function AppVersionFooter() {
  return (
    <footer className="border-t border-white/10 px-4 py-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <div className="space-y-1.5 text-sm text-white/56 sm:text-[15px]">
          <p>Criado e desenvolvido por: Hora do Treino&reg;</p>
          <p>CNPJ: 34.229.533/0001-61</p>
          <p>Todos os direitos reservados</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-white/62">
          <Link href="/politica-de-privacidade" className="font-semibold text-primary transition hover:text-primaryStrong">
            Politica de privacidade
          </Link>
          <Link href="/privacidade" className="font-semibold text-white/72 transition hover:text-white">
            Central de privacidade
          </Link>
        </div>

        <Image
          src={footerLogoSrc}
          alt="Hora do Treino"
          width={188}
          height={40}
          priority
          className="mt-5 h-8 w-auto opacity-95 sm:mt-6 sm:h-10"
        />
      </div>
    </footer>
  );
}
