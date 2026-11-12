import { generateCode, generateJoinCode } from './generateCode';

describe('generateCode', () => {
  it('should generate a 6-digit numeric code', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^[1-9]\d{5}$/);
    }
  });
});

describe('generateJoinCode', () => {
  it('should generate an 8-character lowercase code', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateJoinCode()).toMatch(/^[a-z2-7]{8}$/);
    }
  });

  it('should not repeat codes across calls', () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => generateJoinCode()),
    );
    expect(codes.size).toBe(500);
  });
});
