package expo.modules.dailynative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EventsTest {
  @Test fun mapsTheEventsDailyReads() {
    assertEquals("resumed", Events.type(1))
    assertEquals("paused", Events.type(2))
    assertEquals("screen_on", Events.type(15))
    assertEquals("screen_off", Events.type(16))
    assertEquals("unlock", Events.type(18))
    assertEquals("screen_off", Events.type(26))
  }

  @Test fun ignoresEverythingElse() {
    assertNull(Events.type(0))
    assertNull(Events.type(23))
  }
}
