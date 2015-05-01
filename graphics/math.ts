/**
> Because a transformation matrix has only six elements that can be changed, in most cases in PDF it shall be specified as the six-element array [a b c d e f].

                 ⎡ a b 0 ⎤
[a b c d e f] => ⎢ c d 0 ⎥
                 ⎣ e f 1 ⎦

*/

/**
Multiply two 3x3 matrices, returning a new 3x3 matrix representation.

See 8.3.4 for a shortcut for avoiding full matrix multiplications.
*/
export function mat3mul(A: number[], B: number[]): number[] {
  return [
    (A[0] * B[0]) + (A[1] * B[3]) + (A[2] * B[6]),
    (A[0] * B[1]) + (A[1] * B[4]) + (A[2] * B[7]),
    (A[0] * B[2]) + (A[1] * B[5]) + (A[2] * B[8]),
    (A[3] * B[0]) + (A[4] * B[3]) + (A[5] * B[6]),
    (A[3] * B[1]) + (A[4] * B[4]) + (A[5] * B[7]),
    (A[3] * B[2]) + (A[4] * B[5]) + (A[5] * B[8]),
    (A[6] * B[0]) + (A[7] * B[3]) + (A[8] * B[6]),
    (A[6] * B[1]) + (A[7] * B[4]) + (A[8] * B[7]),
    (A[6] * B[2]) + (A[7] * B[5]) + (A[8] * B[8])
  ];
}

/**
Add two 3x3 matrices, returning a new 3x3 matrix representation.
*/
export function mat3add(A: number[], B: number[]): number[] {
  return [
    A[0] + B[0], A[1] + B[1], A[2] + B[2],
    A[3] + B[3], A[4] + B[4], A[5] + B[5],
    A[6] + B[6], A[7] + B[7], A[8] + B[8]
  ];
}

export const mat3ident = [1, 0, 0,
                          0, 1, 0,
                          0, 0, 1];
