#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Remover contas conectadas INATIVAS do Stripe (com seguranca).

O QUE ESTE SCRIPT FAZ, PASSO A PASSO:
  1. Lista TODAS as contas conectadas da sua plataforma.
  2. Para CADA conta, consulta o saldo (disponivel + pendente + reservado).
  3. So considera "segura para excluir" a conta com saldo ZERADO.
  4. Em MODO TESTE (padrao), ele NAO apaga nada - so mostra o que faria.
  5. So apaga de verdade quando voce rodar com a palavra:  executar
  6. Gera um relatorio .csv com o resultado de cada conta.

IMPORTANTE:
  - Excluir conta no Stripe e PERMANENTE e IRREVERSIVEL.
  - Rode PRIMEIRO em modo teste, confira o relatorio, e so depois use "executar".
  - A sua chave secreta NUNCA fica escrita neste arquivo: ela vem de uma
    variavel de ambiente chamada STRIPE_SECRET_KEY (instrucoes no final).
"""

import os
import sys
import csv
import json
import time
import base64
import urllib.parse
import urllib.request
import urllib.error

# ----------------------------------------------------------------------------
# CONFIGURACAO
# ----------------------------------------------------------------------------

# Contas que voce NAO quer excluir de jeito nenhum (protegidas).
# Ex.: a sua propria conta de teste (per.rsantiago@gmail.com).
# Para proteger, coloque o id entre aspas dentro das chaves, separados por virgula:
#   EXCLUIR_DA_LISTA = {"acct_1L8VigR4lXipZTgc"}
EXCLUIR_DA_LISTA = set()

API = "https://api.stripe.com/v1"
PAUSA_ENTRE_CHAMADAS = 0.15  # segundos, para nao sobrecarregar a API

# ----------------------------------------------------------------------------
# FUNCOES DE APOIO (voce nao precisa mexer daqui pra baixo)
# ----------------------------------------------------------------------------

def pegar_chave():
    chave = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not chave:
        print("ERRO: variavel de ambiente STRIPE_SECRET_KEY nao encontrada.")
        print("Veja as instrucoes de como definir no rodape do arquivo .py.")
        sys.exit(1)
    if not chave.startswith("sk_"):
        print("ERRO: a chave nao parece uma chave secreta (deveria comecar com 'sk_').")
        sys.exit(1)
    if chave.startswith("sk_test"):
        print(">> Atencao: voce esta usando uma chave de TESTE (sk_test...).")
    return chave


def _requisicao(metodo, url, chave):
    cabecalho = {
        "Authorization": "Basic " + base64.b64encode((chave + ":").encode()).decode(),
        "Stripe-Version": "2024-06-20",
    }
    req = urllib.request.Request(url, method=metodo, headers=cabecalho)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            corpo = json.loads(e.read().decode())
            msg = corpo.get("error", {}).get("message", str(e))
        except Exception:
            msg = str(e)
        return None, msg
    except Exception as e:
        return None, str(e)


def listar_contas(chave):
    """Devolve a lista completa de contas conectadas (paginando de 100 em 100)."""
    contas = []
    starting_after = None
    while True:
        params = {"limit": "100"}
        if starting_after:
            params["starting_after"] = starting_after
        url = API + "/accounts?" + urllib.parse.urlencode(params)
        dados, erro = _requisicao("GET", url, chave)
        if erro:
            print("ERRO ao listar contas:", erro)
            sys.exit(1)
        contas.extend(dados["data"])
        if dados.get("has_more"):
            starting_after = dados["data"][-1]["id"]
            time.sleep(PAUSA_ENTRE_CHAMADAS)
        else:
            break
    return contas


def saldo_total(account_id, chave):
    """
    Soma todo o dinheiro da conta conectada (disponivel + pendente + reservado),
    em todas as moedas. Retorna (total_em_centavos, detalhe_texto).
    """
    # O saldo de uma conta conectada e consultado com o cabecalho Stripe-Account.
    cabecalho = {
        "Authorization": "Basic " + base64.b64encode((chave + ":").encode()).decode(),
        "Stripe-Version": "2024-06-20",
        "Stripe-Account": account_id,
    }
    req = urllib.request.Request(API + "/balance", method="GET", headers=cabecalho)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            dados = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return None, "erro ao consultar saldo: " + str(e)
    except Exception as e:
        return None, "erro ao consultar saldo: " + str(e)

    total = 0
    partes = []
    for grupo in ("available", "pending", "connect_reserved"):
        for item in dados.get(grupo, []) or []:
            valor = item.get("amount", 0)
            total += valor
            if valor != 0:
                partes.append(f"{grupo}:{valor} {item.get('currency','').upper()}")
    return total, ("; ".join(partes) if partes else "zerado")


def excluir_conta(account_id, chave):
    dados, erro = _requisicao("DELETE", API + "/accounts/" + account_id, chave)
    if erro:
        return False, erro
    return bool(dados.get("deleted")), "ok"


# ----------------------------------------------------------------------------
# PROGRAMA PRINCIPAL
# ----------------------------------------------------------------------------

def main():
    executar = len(sys.argv) > 1 and sys.argv[1].lower() == "executar"
    modo = "EXECUCAO REAL (vai apagar)" if executar else "MODO TESTE (nao apaga nada)"
    print("=" * 60)
    print("Remocao de contas conectadas do Stripe")
    print("Modo:", modo)
    print("=" * 60)

    chave = pegar_chave()

    print("Listando contas conectadas...")
    contas = listar_contas(chave)
    print(f"Total encontrado: {len(contas)} contas.\n")

    relatorio = []
    excluidas = puladas_saldo = protegidas = erros = 0

    for i, c in enumerate(contas, 1):
        cid = c["id"]
        email = c.get("email") or "-"
        print(f"[{i}/{len(contas)}] {cid}  ({email}) ... ", end="")

        if cid in EXCLUIR_DA_LISTA:
            print("PROTEGIDA (na lista de excecao)")
            relatorio.append([cid, email, "-", "protegida", "esta na lista de excecao"])
            protegidas += 1
            continue

        total, detalhe = saldo_total(cid, chave)
        time.sleep(PAUSA_ENTRE_CHAMADAS)

        if total is None:
            print("ERRO no saldo -> pulada")
            relatorio.append([cid, email, "?", "erro", detalhe])
            erros += 1
            continue

        if total != 0:
            print(f"TEM SALDO ({detalhe}) -> NAO sera excluida")
            relatorio.append([cid, email, detalhe, "pulada_saldo", "conta com saldo, nao excluida"])
            puladas_saldo += 1
            continue

        # Saldo zerado -> segura para excluir
        if not executar:
            print("zerada -> SERIA EXCLUIDA (modo teste)")
            relatorio.append([cid, email, "zerado", "seria_excluida", "modo teste"])
            excluidas += 1
            continue

        ok, msg = excluir_conta(cid, chave)
        time.sleep(PAUSA_ENTRE_CHAMADAS)
        if ok:
            print("EXCLUIDA")
            relatorio.append([cid, email, "zerado", "excluida", "ok"])
            excluidas += 1
        else:
            print("ERRO ao excluir:", msg)
            relatorio.append([cid, email, "zerado", "erro", msg])
            erros += 1

    # Salva relatorio
    nome = "relatorio_remocao_stripe.csv"
    with open(nome, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["account_id", "email", "saldo", "acao", "mensagem"])
        w.writerows(relatorio)

    print("\n" + "=" * 60)
    print("RESUMO")
    print("  Excluidas (ou que seriam):", excluidas)
    print("  Puladas por terem saldo:  ", puladas_saldo)
    print("  Protegidas:               ", protegidas)
    print("  Erros:                    ", erros)
    print("  Relatorio salvo em:       ", os.path.abspath(nome))
    if not executar:
        print("\n>> Isso foi um TESTE. Nada foi apagado.")
        print(">> Confira o relatorio. Para apagar de verdade, rode:")
        print("     python remover_contas_conectadas_stripe.py executar")
    print("=" * 60)


if __name__ == "__main__":
    main()

# ============================================================================
# COMO USAR (Windows)
# ============================================================================
# 1) Pegue sua CHAVE SECRETA no Stripe:
#    Dashboard > Desenvolvedores > Chaves de API > "Chave secreta" (sk_live_...)
#
# 2) Abra o PowerShell na pasta deste arquivo e defina a chave (so nesta janela):
#      $env:STRIPE_SECRET_KEY = "sk_live_COLE_SUA_CHAVE_AQUI"
#
# 3) Rode primeiro em MODO TESTE (nao apaga nada):
#      python remover_contas_conectadas_stripe.py
#
# 4) Abra o arquivo relatorio_remocao_stripe.csv e confira a coluna "acao".
#    - "seria_excluida" = conta zerada que sera removida
#    - "pulada_saldo"   = tem dinheiro, o script NAO vai mexer
#    - "erro"           = algo deu errado nessa conta
#
# 5) Se estiver tudo certo, rode a EXECUCAO REAL:
#      python remover_contas_conectadas_stripe.py executar
#
# DICA: para PROTEGER sua conta de teste (per.rsantiago@gmail.com), edite a
# linha EXCLUIR_DA_LISTA la em cima assim:
#      EXCLUIR_DA_LISTA = {"acct_1L8VigR4lXipZTgc"}
# ============================================================================
