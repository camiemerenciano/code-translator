reclamacoes = []
codigo = 1

while True:
    print("\n--- SISTEMA DE OUVIDORIA ---")
    print("1 - Adicionar reclamação")
    print("2 - Listar reclamações")
    print("3 - Buscar por código")
    print("4 - Remover reclamação")
    print("5 - Atualizar reclamação")
    print("6 - Quantidade de reclamações")
    print("0 - Sair")

    opcao = int(input("Escolha uma opção: "))

    # ADICIONAR
    if opcao == 1:
        titulo = input("Título: ")
        descricao = input("Descrição: ")
        autor = input("Autor: ")

        reclamacao = {
            "codigo": codigo,
            "titulo": titulo,
            "descricao": descricao,
            "autor": autor
        }

        reclamacoes.append(reclamacao)
        print("Reclamação adicionada com sucesso!")

        codigo += 1

    # LISTAR
    elif opcao == 2:
        if len(reclamacoes) == 0:
            print("Nenhuma reclamação cadastrada.")
        else:
            for r in reclamacoes:
                print("\nCódigo:", r["codigo"])
                print("Título:", r["titulo"])
                print("Descrição:", r["descricao"])
                print("Autor:", r["autor"])

    # BUSCAR
    elif opcao == 3:
        busca = int(input("Digite o código: "))
        encontrada = False

        for r in reclamacoes:
            if r["codigo"] == busca:
                print("\nReclamação encontrada:")
                print("Título:", r["titulo"])
                print("Descrição:", r["descricao"])
                print("Autor:", r["autor"])
                encontrada = True

        if not encontrada:
            print("Reclamação não encontrada.")

    # REMOVER
    elif opcao == 4:
        remover = int(input("Digite o código para remover: "))
        encontrada = False

        for r in reclamacoes:
            if r["codigo"] == remover:
                reclamacoes.remove(r)
                print("Reclamação removida.")
                encontrada = True

        if not encontrada:
            print("Código não encontrado.")

    # ATUALIZAR
    elif opcao == 5:
        atualizar = int(input("Digite o código para atualizar: "))
        encontrada = False

        for r in reclamacoes:
            if r["codigo"] == atualizar:
                r["titulo"] = input("Novo título: ")
                r["descricao"] = input("Nova descrição: ")
                r["autor"] = input("Novo autor: ")
                print("Reclamação atualizada.")
                encontrada = True

        if not encontrada:
            print("Código não encontrado.")

    # QUANTIDADE
    elif opcao == 6:
        print("Total de reclamações:", len(reclamacoes))

    # SAIR
    elif opcao == 0:
        print("Encerrando sistema...")
        break

    else:
        print("Opção inválida.")