class Mutex {
  private queue: (() => void)[] = []
  private locked = false

  async lock() {
    if (!this.locked) {
      this.locked = true
      return
    }

    return new Promise<void>(resolve => {
      this.queue.push(resolve)
    })
  }

  unlock() {
    const next = this.queue.shift()

    if (next) {
      next()
    } else {
      this.locked = false
    }
  }
}

export const mutex = new Mutex()