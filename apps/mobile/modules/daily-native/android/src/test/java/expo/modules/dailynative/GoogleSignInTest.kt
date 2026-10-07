package expo.modules.dailynative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class GoogleSignInTest {
  @Test fun sha256HexMatchesKnownVector() {
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", GoogleSignIn.sha256Hex("abc"))
  }

  @Test fun nonceIsRandomAndHashed() {
    val (raw, hashed) = GoogleSignIn.nonce()
    assertEquals(64, raw.length)
    assertEquals(GoogleSignIn.sha256Hex(raw), hashed)
    assertNotEquals(raw, GoogleSignIn.nonce().first)
  }
}
