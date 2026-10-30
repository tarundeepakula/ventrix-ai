const bcrypt = require('bcryptjs');
const prisma = require('./src/lib/prisma');

async function testLogin() {
  try {
    const email = 'tarundeepakula@gmail.com';
    const password = '12345678';

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log('RESULT: User not found in MySQL.');
      return;
    }

    console.log('RESULT: User found in MySQL.');
    console.log('Password hash exists:', Boolean(user.passwordHash));

    const matches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    console.log('Password matches:', matches);

  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testLogin();