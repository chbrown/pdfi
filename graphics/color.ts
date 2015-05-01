export class Color {
  clone(): Color { return new Color(); }
  toString(): string {
    return 'none';
  }
}

export class RGBColor extends Color {
  constructor(public r: number, public g: number, public b: number) { super() }
  clone(): RGBColor { return new RGBColor(this.r, this.g, this.b); }
  toString(): string {
    return `rgb(${this.r}, ${this.g}, ${this.b})`;
  }
}

export class GrayColor extends Color {
  constructor(public alpha: number) { super() }
  clone(): GrayColor { return new GrayColor(this.alpha); }
  toString(): string {
    return `rgb(${this.alpha}, ${this.alpha}, ${this.alpha})`;
  }
}

export class CMYKColor extends Color {
  constructor(public c: number, public m: number, public y: number, public k: number) { super() }
  clone(): CMYKColor { return new CMYKColor(this.c, this.m, this.y, this.k); }
  toString(): string {
    return `cmyk(${this.c}, ${this.m}, ${this.y}, ${this.k})`;
  }
}
