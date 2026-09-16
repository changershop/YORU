package com.example.yoru.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.yoru.data.model.SpotlightSlide
import com.example.yoru.ui.theme.*

@Composable
fun HeroSpotlightCarousel(
    spotlights: List<SpotlightSlide>,
    onWatchClick: (String) -> Unit,
    onDetailClick: (String) -> Unit
) {
    if (spotlights.isEmpty()) return

    val pagerState = rememberPagerState(pageCount = { spotlights.size })

    Column(modifier = Modifier.fillMaxWidth()) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .fillMaxWidth()
                .height(380.dp)
                .testTag("spotlight_carousel")
        ) { page ->
            val slide = spotlights[page]
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clickable { onDetailClick(slide.animeSlug) }
            ) {
                // Backdrop Image
                AsyncImage(
                    model = slide.backdrop,
                    contentDescription = slide.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )

                // Cinematic Gradient Overlays
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color.Transparent,
                                    YoruBackground.copy(alpha = 0.6f),
                                    YoruBackground
                                ),
                                startY = 100f
                            )
                        )
                )

                // Content
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomStart)
                        .padding(horizontal = 16.dp, vertical = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Badge
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(YoruIndigoPrimary)
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = slide.badge,
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }

                    // Title
                    Text(
                        text = slide.title,
                        style = MaterialTheme.typography.headlineSmall.copy(
                            fontWeight = FontWeight.Black,
                            letterSpacing = (-0.5).sp
                        ),
                        color = YoruTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Meta row
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = slide.format,
                            color = YoruTextMuted,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(text = "•", color = YoruTextMuted, fontSize = 12.sp)
                        Text(
                            text = slide.year,
                            color = YoruTextMuted,
                            fontSize = 12.sp
                        )
                        Text(text = "•", color = YoruTextMuted, fontSize = 12.sp)
                        Text(
                            text = slide.duration,
                            color = YoruTextMuted,
                            fontSize = 12.sp
                        )
                    }

                    // Synopsis
                    Text(
                        text = slide.synopsis,
                        style = MaterialTheme.typography.bodySmall,
                        color = YoruTextMuted,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    // Action buttons
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Button(
                            onClick = { onWatchClick(slide.animeSlug) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = YoruIndigoPrimary,
                                contentColor = Color.White
                            ),
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 10.dp),
                            modifier = Modifier.testTag("hero_watch_btn_${slide.id}")
                        ) {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Watch Now",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                        }

                        OutlinedButton(
                            onClick = { onDetailClick(slide.animeSlug) },
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = YoruTextPrimary
                            ),
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                            border = ButtonDefaults.outlinedButtonBorder.copy(
                                brush = Brush.linearGradient(listOf(YoruCardBorder, YoruCardBorder))
                            ),
                            modifier = Modifier.testTag("hero_detail_btn_${slide.id}")
                        ) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Details",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }
        }

        // Pager indicator dots
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 10.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            repeat(spotlights.size) { index ->
                val isSelected = pagerState.currentPage == index
                Box(
                    modifier = Modifier
                        .padding(horizontal = 4.dp)
                        .size(if (isSelected) 18.dp else 6.dp, 6.dp)
                        .clip(CircleShape)
                        .background(if (isSelected) YoruIndigoPrimary else YoruCardBorder)
                )
            }
        }
    }
}
