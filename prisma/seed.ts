import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const FIRST_NAMES = [
  'Ana', 'Maria', 'João', 'Pedro', 'Lucas', 'Mariana', 'Beatriz', 'Gabriel',
  'Rafael', 'Camila', 'Fernanda', 'Bruno', 'Juliana', 'Rodrigo', 'Larissa',
  'Felipe', 'Amanda', 'Thiago', 'Patrícia', 'Diego', 'Vanessa', 'Marcelo',
  'Aline', 'Eduardo', 'Renata', 'Leonardo', 'Priscila', 'Gustavo', 'Débora',
  'André', 'Cristina', 'Vinícius', 'Simone', 'Ricardo', 'Tatiane', 'Alexandre',
  'Daniela', 'Fábio', 'Michele', 'Rogério', 'Elaine', 'Sérgio', 'Cláudia',
  'Marcos', 'Viviane', 'Paulo', 'Silvia', 'Roberto', 'Adriana', 'Henrique',
  'Isabela',
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves',
  'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho',
  'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha',
  'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado',
  'Mendes', 'Freitas', 'Cardoso', 'Ramos', 'Gonçalves', 'Santana', 'Teixeira',
  'Correia', 'Cavalcanti', 'Pinto', 'Monteiro', 'Moura',
];

// Remove acentos.
function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function main() {
  const roleDistribution: { role: Role; count: number }[] = [
    { role: Role.ADMIN, count: 2 },
    { role: Role.TEACHER, count: 15 },
    { role: Role.STUDENT, count: 83 },
  ];

  const usedNames = new Set<string>();
  const usersToCreate: { name: string; email: string; role: Role }[] = [];

  for (const { role, count } of roleDistribution) {
    for (let i = 0; i < count; i++) {
      let fullName = '';
      let emailBase = '';

      // Garante que não repetimos exatamente o mesmo nome completo.
      do {
        const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
        const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
        fullName = `${first} ${last}`;
        emailBase = `${slugify(first)}.${slugify(last)}`;
      } while (usedNames.has(fullName));

      usedNames.add(fullName);

      // Se o e-mail base já tiver sido usado por outra combinação, adiciona um número no final pra garantir unicidade.
      let email = `${emailBase}@faculdade.edu.br`;
      let suffix = 1;
      while (usersToCreate.some((u) => u.email === email)) {
        email = `${emailBase}${suffix}@faculdade.edu.br`;
        suffix++;
      }

      usersToCreate.push({ name: fullName, email, role });
    }
  }

  const result = await prisma.user.createMany({
    data: usersToCreate,
    skipDuplicates: true, // ignora e-mails que já existirem no banco
  });

  console.log(`${result.count} usuários criados.`);
  console.log(
    `   Distribuição: ${roleDistribution.map((r) => `${r.count} ${r.role}`).join(', ')}`,
  );
}

main()
  .catch((error) => {
    console.error('Erro ao popular o banco:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });