using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public class ImageMetricsResult
{
    public bool Success { get; set; }
    public string Error { get; set; }
    public int Width1 { get; set; }
    public int Height1 { get; set; }
    public int Width2 { get; set; }
    public int Height2 { get; set; }
    public double Ssim { get; set; }
    public double Mae { get; set; }
    public double NormalizedMae { get; set; }
    public double Rmse { get; set; }
    public double MismatchRatio { get; set; }
    public long MismatchPixelCount { get; set; }
    public long TotalPixels { get; set; }

    // Content bounding box offsets
    public int BBox1_X { get; set; }
    public int BBox1_Y { get; set; }
    public int BBox1_W { get; set; }
    public int BBox1_H { get; set; }

    public int BBox2_X { get; set; }
    public int BBox2_Y { get; set; }
    public int BBox2_W { get; set; }
    public int BBox2_H { get; set; }

    public int DeltaX { get; set; }
    public int DeltaY { get; set; }
    public int DeltaW { get; set; }
    public int DeltaH { get; set; }

    // Structural Category Differences
    public double TextDetailMismatchRatio { get; set; }
    public double BackgroundMismatchRatio { get; set; }

    public string DiffImagePath { get; set; }
    public string OverlayImagePath { get; set; }
}

public static class ImageMetricsCalculator
{
    private const double C1 = 6.5025;   // (0.01 * 255)^2
    private const double C2 = 58.5225;  // (0.03 * 255)^2

    public static ImageMetricsResult CompareImages(
        string path1,
        string path2,
        string diffOutPath = null,
        string overlayOutPath = null,
        int tolerance = 10,
        int blockSize = 8)
    {
        var result = new ImageMetricsResult();

        if (!File.Exists(path1) || !File.Exists(path2))
        {
            result.Success = false;
            result.Error = "One or both image files do not exist: " + path1 + " / " + path2;
            return result;
        }

        Bitmap bmp1 = null;
        Bitmap bmp2 = null;
        Bitmap diffBmp = null;
        Bitmap overlayBmp = null;

        try
        {
            bmp1 = new Bitmap(path1);
            bmp2 = new Bitmap(path2);

            int w1 = bmp1.Width;
            int h1 = bmp1.Height;
            int w2 = bmp2.Width;
            int h2 = bmp2.Height;

            result.Width1 = w1;
            result.Height1 = h1;
            result.Width2 = w2;
            result.Height2 = h2;

            int maxW = Math.Max(w1, w2);
            int maxH = Math.Max(h1, h2);
            int minW = Math.Min(w1, w2);
            int minH = Math.Min(h1, h2);

            result.TotalPixels = (long)maxW * maxH;

            bool needDiff = !string.IsNullOrEmpty(diffOutPath);
            bool needOverlay = !string.IsNullOrEmpty(overlayOutPath);

            if (needDiff) diffBmp = new Bitmap(maxW, maxH, PixelFormat.Format32bppArgb);
            if (needOverlay) overlayBmp = new Bitmap(maxW, maxH, PixelFormat.Format32bppArgb);

            // Lock bits for fast evaluation
            BitmapData data1 = bmp1.LockBits(new Rectangle(0, 0, w1, h1), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            BitmapData data2 = bmp2.LockBits(new Rectangle(0, 0, w2, h2), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);

            BitmapData diffData = needDiff ? diffBmp.LockBits(new Rectangle(0, 0, maxW, maxH), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb) : null;
            BitmapData overlayData = needOverlay ? overlayBmp.LockBits(new Rectangle(0, 0, maxW, maxH), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb) : null;

            // Extract Grayscale Luminance arrays
            double[,] lum1 = new double[maxW, maxH];
            double[,] lum2 = new double[maxW, maxH];

            // Bounding box tracking for content (non-white threshold: lum < 245)
            int minX1 = maxW, minY1 = maxH, maxX1 = 0, maxY1 = 0;
            int minX2 = maxW, minY2 = maxH, maxX2 = 0, maxY2 = 0;
            bool foundContent1 = false;
            bool foundContent2 = false;

            long mismatchCount = 0;
            double sumAbsDiff = 0.0;
            double sumSqDiff = 0.0;

            long textDetailMismatches = 0;
            long backgroundMismatches = 0;

            int stride1 = data1.Stride;
            int stride2 = data2.Stride;
            int diffStride = diffData != null ? diffData.Stride : 0;
            int overlayStride = overlayData != null ? overlayData.Stride : 0;

            byte[] buf1 = new byte[stride1 * h1];
            byte[] buf2 = new byte[stride2 * h2];
            byte[] bufDiff = diffData != null ? new byte[diffStride * maxH] : null;
            byte[] bufOverlay = overlayData != null ? new byte[overlayStride * maxH] : null;

            System.Runtime.InteropServices.Marshal.Copy(data1.Scan0, buf1, 0, buf1.Length);
            System.Runtime.InteropServices.Marshal.Copy(data2.Scan0, buf2, 0, buf2.Length);

            for (int y = 0; y < maxH; y++)
            {
                for (int x = 0; x < maxW; x++)
                {
                    bool in1 = (x < w1) && (y < h1);
                    bool in2 = (x < w2) && (y < h2);

                    double y1Val = 255.0;
                    double y2Val = 255.0;

                    byte b1 = 255, g1 = 255, r1 = 255;
                    byte b2 = 255, g2 = 255, r2 = 255;

                    if (in1)
                    {
                        int idx1 = (y * stride1) + (x * 4);
                        b1 = buf1[idx1];
                        g1 = buf1[idx1 + 1];
                        r1 = buf1[idx1 + 2];
                        y1Val = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;

                        if (y1Val < 245.0)
                        {
                            foundContent1 = true;
                            if (x < minX1) minX1 = x;
                            if (x > maxX1) maxX1 = x;
                            if (y < minY1) minY1 = y;
                            if (y > maxY1) maxY1 = y;
                        }
                    }

                    if (in2)
                    {
                        int idx2 = (y * stride2) + (x * 4);
                        b2 = buf2[idx2];
                        g2 = buf2[idx2 + 1];
                        r2 = buf2[idx2 + 2];
                        y2Val = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;

                        if (y2Val < 245.0)
                        {
                            foundContent2 = true;
                            if (x < minX2) minX2 = x;
                            if (x > maxX2) maxX2 = x;
                            if (y < minY2) minY2 = y;
                            if (y > maxY2) maxY2 = y;
                        }
                    }

                    lum1[x, y] = y1Val;
                    lum2[x, y] = y2Val;

                    double diffVal = Math.Abs(y1Val - y2Val);
                    sumAbsDiff += diffVal;
                    sumSqDiff += (diffVal * diffVal);

                    bool isMismatch = diffVal > tolerance;
                    if (isMismatch)
                    {
                        mismatchCount++;

                        if (diffVal > 80.0) textDetailMismatches++;
                        else backgroundMismatches++;
                    }

                    if (bufDiff != null)
                    {
                        int idxDiff = (y * diffStride) + (x * 4);
                        if (isMismatch)
                        {
                            // Highlight in vibrant magenta (#EB0F78)
                            bufDiff[idxDiff] = 120;     // B
                            bufDiff[idxDiff + 1] = 15;  // G
                            bufDiff[idxDiff + 2] = 235; // R
                            bufDiff[idxDiff + 3] = 255; // A
                        }
                        else
                        {
                            // Dim grayscale context
                            byte gray = (byte)Math.Min(255.0, y1Val * 0.4 + 140.0);
                            bufDiff[idxDiff] = gray;
                            bufDiff[idxDiff + 1] = gray;
                            bufDiff[idxDiff + 2] = gray;
                            bufDiff[idxDiff + 3] = 255;
                        }
                    }

                    if (bufOverlay != null)
                    {
                        int idxOverlay = (y * overlayStride) + (x * 4);
                        bufOverlay[idxOverlay] = (byte)((b1 + b2) / 2);
                        bufOverlay[idxOverlay + 1] = (byte)((g1 + g2) / 2);
                        bufOverlay[idxOverlay + 2] = (byte)((r1 + r2) / 2);
                        bufOverlay[idxOverlay + 3] = 255;
                    }
                }
            }

            if (bufDiff != null && diffData != null)
            {
                System.Runtime.InteropServices.Marshal.Copy(bufDiff, 0, diffData.Scan0, bufDiff.Length);
            }
            if (bufOverlay != null && overlayData != null)
            {
                System.Runtime.InteropServices.Marshal.Copy(bufOverlay, 0, overlayData.Scan0, bufOverlay.Length);
            }


            bmp1.UnlockBits(data1);
            bmp2.UnlockBits(data2);
            if (diffData != null) diffBmp.UnlockBits(diffData);
            if (overlayData != null) overlayBmp.UnlockBits(overlayData);

            if (needDiff && diffBmp != null)
            {
                string dir = Path.GetDirectoryName(diffOutPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                diffBmp.Save(diffOutPath, ImageFormat.Png);
                result.DiffImagePath = diffOutPath;
            }

            if (needOverlay && overlayBmp != null)
            {
                string dir = Path.GetDirectoryName(overlayOutPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                overlayBmp.Save(overlayOutPath, ImageFormat.Png);
                result.OverlayImagePath = overlayOutPath;
            }

            // Compute Standard SSIM (Mean SSIM over 8x8 blocks)
            double ssimTotal = 0.0;
            int blockCount = 0;

            int numBlocksX = maxW / blockSize;
            int numBlocksY = maxH / blockSize;

            for (int by = 0; by < numBlocksY; by++)
            {
                int startY = by * blockSize;
                for (int bx = 0; bx < numBlocksX; bx++)
                {
                    int startX = bx * blockSize;

                    double sum1 = 0.0;
                    double sum2 = 0.0;
                    int N = blockSize * blockSize;

                    for (int y = 0; y < blockSize; y++)
                    {
                        for (int x = 0; x < blockSize; x++)
                        {
                            sum1 += lum1[startX + x, startY + y];
                            sum2 += lum2[startX + x, startY + y];
                        }
                    }

                    double mu1 = sum1 / N;
                    double mu2 = sum2 / N;

                    double var1 = 0.0;
                    double var2 = 0.0;
                    double covar = 0.0;

                    for (int y = 0; y < blockSize; y++)
                    {
                        for (int x = 0; x < blockSize; x++)
                        {
                            double d1 = lum1[startX + x, startY + y] - mu1;
                            double d2 = lum2[startX + x, startY + y] - mu2;
                            var1 += d1 * d1;
                            var2 += d2 * d2;
                            covar += d1 * d2;
                        }
                    }

                    double sigma1Sq = var1 / (N - 1);
                    double sigma2Sq = var2 / (N - 1);
                    double sigma12 = covar / (N - 1);

                    double num = (2.0 * mu1 * mu2 + C1) * (2.0 * sigma12 + C2);
                    double den = (mu1 * mu1 + mu2 * mu2 + C1) * (sigma1Sq + sigma2Sq + C2);

                    double blockSsim = num / den;
                    ssimTotal += blockSsim;
                    blockCount++;
                }
            }

            result.Ssim = blockCount > 0 ? Math.Round(ssimTotal / blockCount, 4) : 1.0;
            result.Mae = Math.Round(sumAbsDiff / result.TotalPixels, 2);
            result.NormalizedMae = Math.Round(result.Mae / 255.0, 4);
            result.Rmse = Math.Round(Math.Sqrt(sumSqDiff / result.TotalPixels), 2);
            result.MismatchPixelCount = mismatchCount;
            result.MismatchRatio = Math.Round((double)mismatchCount / result.TotalPixels, 4);

            result.TextDetailMismatchRatio = Math.Round((double)textDetailMismatches / result.TotalPixels, 4);
            result.BackgroundMismatchRatio = Math.Round((double)backgroundMismatches / result.TotalPixels, 4);

            if (foundContent1)
            {
                result.BBox1_X = minX1;
                result.BBox1_Y = minY1;
                result.BBox1_W = maxX1 - minX1 + 1;
                result.BBox1_H = maxY1 - minY1 + 1;
            }
            if (foundContent2)
            {
                result.BBox2_X = minX2;
                result.BBox2_Y = minY2;
                result.BBox2_W = maxX2 - minX2 + 1;
                result.BBox2_H = maxY2 - minY2 + 1;
            }

            if (foundContent1 && foundContent2)
            {
                result.DeltaX = result.BBox2_X - result.BBox1_X;
                result.DeltaY = result.BBox2_Y - result.BBox1_Y;
                result.DeltaW = result.BBox2_W - result.BBox1_W;
                result.DeltaH = result.BBox2_H - result.BBox1_H;
            }

            result.Success = true;
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = ex.Message;
        }
        finally
        {
            if (bmp1 != null) bmp1.Dispose();
            if (bmp2 != null) bmp2.Dispose();
            if (diffBmp != null) diffBmp.Dispose();
            if (overlayBmp != null) overlayBmp.Dispose();
        }

        return result;
    }
}
