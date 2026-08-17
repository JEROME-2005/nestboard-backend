import {
  Router,
} from "express"

import multer from "multer"

import path from "node:path"

import fs from "node:fs"

import {
  randomUUID,
} from "node:crypto"

import {
  Role,
} from "../generated/enums.js"

import {
  verifyJwt,
  requireRole,
} from "../middleware/auth.js"

import {
  env,
} from "../lib/env.js"

import {
  Errors,
} from "../lib/errors.js"

import {
  uploadToR2,
} from "../lib/storage.js"

export const uploadsRouter =
  Router()

const useR2 =
  env.UPLOAD_PROVIDER === "r2"

const localUploadDirectory =
  path.resolve(
    env.UPLOAD_LOCAL_DIR
  )

if (!useR2) {
  fs.mkdirSync(
    localUploadDirectory,
    {
      recursive: true,
    }
  )
}

const storage = useR2
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (
        _req,
        _file,
        callback
      ) => {
        callback(
          null,
          localUploadDirectory
        )
      },

      filename: (
        _req,
        file,
        callback
      ) => {
        const ext =
          path
            .extname(
              file.originalname
            )
            .toLowerCase()

        callback(
          null,
          `${randomUUID()}${ext}`
        )
      },
    })

const upload =
  multer({
    storage,

    limits: {
      fileSize:
        5 * 1024 * 1024,
    },

    fileFilter: (
      _req,
      file,
      callback
    ) => {
      const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp",
      ]

      if (
        !allowed.includes(
          file.mimetype
        )
      ) {
        callback(
          Errors.validation(
            "Only JPG, PNG and WEBP images are allowed"
          ) as any
        )

        return
      }

      callback(null, true)
    },
  })

uploadsRouter.post(
  "/cover-image",

  verifyJwt,

  requireRole(Role.ADMIN),

  upload.single("image"),

  async (
    req,
    res,
    next
  ) => {
    try {
      if (!req.file) {
        throw Errors.validation(
          "No image was uploaded."
        )
      }

      if (useR2) {
        const ext =
          path
            .extname(
              req.file.originalname
            )
            .toLowerCase()

        const key =
          `cover-images/${randomUUID()}${ext}`

        const url =
          await uploadToR2(
            key,
            req.file.buffer,
            req.file.mimetype
          )

        res.status(201).json({
          url,
        })

        return
      }

      res.status(201).json({
        url:
          `/uploads/${req.file.filename}`,
      })
    } catch (error) {
      next(error)
    }
  }
)

uploadsRouter.post(
  "/profile-image",

  verifyJwt,

  upload.single("image"),

  async (
    req,
    res,
    next
  ) => {
    try {
      if (!req.file) {
        throw Errors.validation(
          "No image was uploaded."
        )
      }

      if (useR2) {
        const ext =
          path
            .extname(
              req.file.originalname
            )
            .toLowerCase()

        const key =
          `profile-images/${req.user!.id}/${randomUUID()}${ext}`

        const url =
          await uploadToR2(
            key,
            req.file.buffer,
            req.file.mimetype
          )

        res.status(201).json({
          url,
        })

        return
      }

      res.status(201).json({
        url:
          `/uploads/${req.file.filename}`,
      })
    } catch (error) {
      next(error)
    }
  }
)