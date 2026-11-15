interface PcmInput {
  numberOfChannels: number
  length: number
  getChannelData: (channel: number) => Float32Array
}
/** One reusable PCM block; encoder.encodeBuffer consumes it synchronously. */
export class MonoPcmConverter {
  private samples = new Int16Array(0)
  private channels: Float32Array[] = []
  peak = 0
  convert(input: PcmInput) {
    const count = input.numberOfChannels,
      length = input.length
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 32 ||
      !Number.isInteger(length) ||
      length < 1 ||
      length > 16384
    )
      throw new Error("Invalid audio block")
    if (this.samples.length !== length) this.samples = new Int16Array(length)
    this.channels.length = count
    for (let channel = 0; channel < count; channel++)
      this.channels[channel] = input.getChannelData(channel)
    const scale = 1 / count
    for (let i = 0; i < length; i++) {
      let value = 0
      for (let channel = 0; channel < count; channel++) value += this.channels[channel]![i]!
      value *= scale
      if (!Number.isFinite(value)) value = 0
      this.peak = Math.max(this.peak, Math.abs(value))
      this.samples[i] = Math.round(Math.max(-1, Math.min(1, value)) * 32767)
    }
    return this.samples
  }
}
