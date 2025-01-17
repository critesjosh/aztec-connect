import { randomBytes } from 'crypto';
import { GrumpkinAddress } from '../address';
import { NoteAlgorithms } from './note_algorithms';
import { Grumpkin } from '../ecc/grumpkin';
import { BarretenbergWasm } from '../wasm';
import { ViewingKey } from '../viewing_key';
import { batchDecryptNotes } from './batch_decrypt_notes';

describe('batch_decypt_notes', () => {
  let grumpkin: Grumpkin;
  let noteAlgos!: NoteAlgorithms;

  const createKeyPair = () => {
    const privKey = grumpkin.getRandomFr();
    const pubKey = new GrumpkinAddress(grumpkin.mul(Grumpkin.one, privKey));
    return { privKey, pubKey };
  };

  beforeAll(async () => {
    const wasm = await BarretenbergWasm.new();
    grumpkin = new Grumpkin(wasm);
    noteAlgos = new NoteAlgorithms(wasm);
  });

  it('batch decrypt multiple viewing keys', async () => {
    const owner = createKeyPair();
    const eph = createKeyPair();
    const noteBufs = Array(4)
      .fill(0)
      .map(() => randomBytes(72));
    const keys = noteBufs.map(noteBuf => ViewingKey.createFromEphPriv(noteBuf, owner.pubKey, eph.privKey, grumpkin));
    const keysBuf = Buffer.concat(keys.map(k => k.toBuffer()));
    const decryptedNotes = await batchDecryptNotes(keysBuf, owner.privKey, noteAlgos, grumpkin);

    expect(decryptedNotes.length).toBe(noteBufs.length);
    decryptedNotes.forEach((decrypted, i) => {
      expect(decrypted!.noteBuf).toEqual(noteBufs[i]);
      expect(decrypted!.ephPubKey).toEqual(eph.pubKey);
    });
  });

  it('batch decrypt owned and unknown viewing keys', async () => {
    const owner = createKeyPair();
    const eph = createKeyPair();
    const noteBufs = Array(4)
      .fill(0)
      .map(() => randomBytes(72));
    const keys = noteBufs.map(noteBuf => ViewingKey.createFromEphPriv(noteBuf, owner.pubKey, eph.privKey, grumpkin));
    // Replace the thrid key with a random key.
    keys.splice(2, 1, ViewingKey.random());
    // Append an extra random key.
    keys.push(ViewingKey.random());
    const keysBuf = Buffer.concat(keys.map(k => k.toBuffer()));
    const decryptedNotes = await batchDecryptNotes(keysBuf, owner.privKey, noteAlgos, grumpkin);

    expect(decryptedNotes.length).toBe(noteBufs.length);
    decryptedNotes.forEach((decrypted, i) => {
      if (i === 2) {
        expect(decrypted).toBe(undefined);
      } else {
        expect(decrypted!.noteBuf).toEqual(noteBufs[i]);
        expect(decrypted!.ephPubKey).toEqual(eph.pubKey);
      }
    });
  });
});
