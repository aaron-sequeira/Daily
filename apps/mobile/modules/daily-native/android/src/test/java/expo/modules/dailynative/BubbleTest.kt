package expo.modules.dailynative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BubbleTest {
  @Test fun snapsToTheNearestSide() {
    assertEquals(0, Bubble.snapX(100, 160, 1080))
    assertEquals(920, Bubble.snapX(700, 160, 1080))
    assertEquals(0, Bubble.snapX(-50, 160, 1080))
  }

  @Test fun tellsATapFromADrag() {
    assertTrue(Bubble.isTap(3f, 2f, 150, 24f))
    assertFalse(Bubble.isTap(40f, 0f, 150, 24f))
    assertFalse(Bubble.isTap(0f, 0f, 700, 24f)) // that's a long press
  }
}
