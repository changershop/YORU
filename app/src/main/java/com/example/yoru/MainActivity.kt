package com.example.yoru

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.navigation.compose.rememberNavController
import com.example.yoru.ui.YoruViewModel
import com.example.yoru.ui.navigation.YoruNavGraph
import com.example.yoru.ui.theme.RemixYORUTheme

class MainActivity : ComponentActivity() {
    private val viewModel: YoruViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            RemixYORUTheme {
                val navController = rememberNavController()
                YoruNavGraph(
                    navController = navController,
                    viewModel = viewModel
                )
            }
        }
    }
}
