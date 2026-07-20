'use client'

import { useState, useCallback, useRef } from 'react'
import Cropper, { Area } from 'react-easy-crop'

interface ImageCropperProps {
  image: string
  onCropComplete: (croppedImage: string) => void
  onCancel: () => void
  aspect?: number
}

export default function ImageCropper({ image, onCropComplete, onCancel, aspect = 750 / 320 }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const onCropChange = useCallback((location: { x: number; y: number }) => {
    setCrop(location)
  }, [])

  const onZoomChange = useCallback((zoom: number) => {
    setZoom(zoom)
  }, [])

  const onCropCompleteHandler = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imageElement = new Image()
    imageElement.crossOrigin = 'anonymous'
    imageElement.src = image

    await new Promise<void>((resolve) => {
      imageElement.onload = () => resolve()
    })

    canvas.width = croppedAreaPixels.width
    canvas.height = croppedAreaPixels.height

    ctx.drawImage(
      imageElement,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      croppedAreaPixels.width,
      croppedAreaPixels.height
    )

    const base64 = canvas.toDataURL('image/jpeg', 0.9)
    onCropComplete(base64)
  }, [croppedAreaPixels, image, onCropComplete])

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 bg-white">
        <button onClick={onCancel} className="text-sm text-text-secondary">取消</button>
        <span className="text-sm font-medium">调整图片位置</span>
        <button onClick={handleSave} className="text-sm text-primary-500 font-medium">确认</button>
      </div>

      {/* Cropper */}
      <div className="flex-1 relative">
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropCompleteHandler}
          cropShape="rect"
          showGrid={true}
        />
      </div>

      {/* Zoom slider */}
      <div className="bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-light">缩小</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary-500"
          />
          <span className="text-xs text-text-light">放大</span>
        </div>
        <p className="text-xs text-text-light text-center mt-2">拖拽图片调整显示区域，推荐比例 750:320</p>
      </div>
    </div>
  )
}
